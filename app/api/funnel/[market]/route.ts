import { NextRequest, NextResponse } from 'next/server';
import {
  getFunnelSeries, getFunnelTotals, getPaymentBreakdown, getSessionSplitByPeriod, getPaidOrdersDaily,
  type Market, type Granularity,
} from '@/lib/funnel/queries';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_10M = 10 * 60 * 1000;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }
function isoDate(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function granFor(since: string, until: string): Granularity {
  const days = Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1;
  if (days <= 31) return 'day';
  if (days <= 95) return 'week';
  return 'month';
}
const share = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const since = isoDate(url.searchParams.get('since'));
  const until = isoDate(url.searchParams.get('until'));
  if (!since || !until) return NextResponse.json({ error: 'since/until required (YYYY-MM-DD)' }, { status: 400 });
  const gran: Granularity = (url.searchParams.get('gran') as Granularity) || granFor(since, until);

  try {
    const result = await memo(`funnel:v1:${market}:${since}:${until}:${gran}`, TTL_10M, async () => {
      // Cassia 2026-06-21: funil (ShopifyQL) é o core; pagamento (BQ) é não-fatal — se o BQ falhar,
      // o funil ainda aparece com o bloco de pagamento vazio.
      const emptyPay = { cards: [], cardTotal: 0, pixPaid: 0, pixPending: 0, other: 0, hasPix: market === 'BR' };
      const [series, totals, payment, today, sessionSplit, paidDaily] = await Promise.all([
        getFunnelSeries(market, since, until, gran),
        getFunnelTotals(market, since, until),
        getPaymentBreakdown(market, since, until).catch((e) => { console.warn('[funnel] payment failed:', e?.message); return emptyPay; }),
        getFunnelTotals(market, 'today', 'today').catch(() => null),
        getSessionSplitByPeriod(market, since, until, gran).catch((e) => { console.warn('[funnel] sessionSplit failed:', e?.message); return new Map<string, { media: number; crm: number; direct: number; organic: number }>(); }),
        getPaidOrdersDaily(market, since, until).catch((e) => { console.warn('[funnel] paidOrders failed:', e?.message); return []; }),
      ]);

      // #1: share de cada etapa por ponto da série (overtime, em %).
      const shareSeries = series.map((p) => ({
        date: p.date,
        cart: share(p.addToCart, p.sessions),
        checkout: share(p.reachedCheckout, p.addToCart),
        pedido: share(p.completed, p.reachedCheckout),
        cvr: share(p.completed, p.sessions),
      }));

      // #2/#3: por período — sessões (site/mídia/CRM) e funil de pedido (carrinho/checkout/pedidos PAGOS).
      // Sessões mídia/CRM vêm classificadas por UTM no ShopifyQL; pedidos pagos vêm do BQ (orders mirror), bucketizados.
      const sumRange = (arr: any[], key: string, from: string, toExcl: string | null) =>
        arr.filter((x) => x.date >= from && (toExcl == null || x.date < toExcl)).reduce((s, x) => s + (Number(x[key]) || 0), 0);
      const context = series.map((p, i) => {
        const toExcl = i + 1 < series.length ? series[i + 1].date : null;
        const split = sessionSplit.get(p.date) || { media: 0, crm: 0, direct: 0, organic: 0 };
        return {
          date: p.date,
          sessions: p.sessions,            // site (total)
          mediaSessions: split.media,      // pago: google + criteo + meta
          crmSessions: split.crm,          // email + sms + whatsapp
          directSessions: split.direct,    // tráfego direto (sem utm_medium)
          organicSessions: split.organic,  // social/organic/referral
          addToCart: p.addToCart,
          checkout: p.reachedCheckout,
          paidOrders: sumRange(paidDaily, 'paidOrders', p.date, toExcl),
          bounceRate: p.bounceRate,
        };
      });
      const mediaSessTotal = context.reduce((s, x) => s + x.mediaSessions, 0);
      const crmSessTotal = context.reduce((s, x) => s + x.crmSessions, 0);
      const directSessTotal = context.reduce((s, x) => s + x.directSessions, 0);
      const organicSessTotal = context.reduce((s, x) => s + x.organicSessions, 0);
      const paidOrdersTotal = paidDaily.reduce((s, x) => s + x.paidOrders, 0);

      const shares = {
        cartFromSessions: share(totals.addToCart, totals.sessions),
        checkoutFromCart: share(totals.reachedCheckout, totals.addToCart),
        completedFromCheckout: share(totals.completed, totals.reachedCheckout),
        overallCvr: share(totals.completed, totals.sessions),
      };

      // Cassia 2026-06-22: status de cada transição do funil HOJE vs média do período, sempre visível.
      // Severidade pelo desvio relativo JÁ ARREDONDADO (o mesmo número que aparece no card, p/ badge e
      // valor nunca divergirem): crítico (queda ≥40%), atenção (≥15%), acima (alta ≥15%), normal.
      // 'insufficient' quando o denominador da etapa hoje é pequeno demais p/ ser confiável.
      type Severity = 'critical' | 'warning' | 'ok' | 'good' | 'insufficient';
      const stepStatus: Array<{ step: string; todayRate: number; periodRate: number; deltaPct: number; severity: Severity }> = [];
      if (today && today.sessions >= 50) {
        const steps = [
          { label: 'Sessões → Carrinho', tn: today.addToCart, td: today.sessions, pn: totals.addToCart, pd: totals.sessions },
          { label: 'Carrinho → Checkout', tn: today.reachedCheckout, td: today.addToCart, pn: totals.reachedCheckout, pd: totals.addToCart },
          { label: 'Checkout → Pedido', tn: today.completed, td: today.reachedCheckout, pn: totals.completed, pd: totals.reachedCheckout },
        ];
        for (const s of steps) {
          const todayRate = share(s.tn, s.td);
          const periodRate = share(s.pn, s.pd);
          const deltaPct = periodRate > 0 ? Math.round(((todayRate - periodRate) / periodRate) * 100) : 0;
          let severity: Severity;
          if (s.td < 25 || periodRate <= 0) severity = 'insufficient';
          else if (deltaPct <= -40) severity = 'critical';
          else if (deltaPct <= -15) severity = 'warning';
          else if (deltaPct >= 15) severity = 'good';
          else severity = 'ok';
          stepStatus.push({ step: s.label, todayRate, periodRate, deltaPct, severity });
        }
      }
      // Banner só dispara nas etapas problemáticas (queda); inclui dropPct p/ compat com o banner.
      const alerts = stepStatus
        .filter((s) => s.severity === 'critical' || s.severity === 'warning')
        .map((s) => ({ step: s.step, todayRate: s.todayRate, periodRate: s.periodRate, dropPct: -s.deltaPct, severity: s.severity }));

      return { available: true, market, since, until, gran, series, totals, shares, payment, today, alerts, stepStatus, shareSeries, context, mediaSessTotal, crmSessTotal, directSessTotal, organicSessTotal, paidOrdersTotal };
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/funnel]', market, msg);
    return NextResponse.json({
      available: false, market, since, until, gran, error: msg,
      series: [], totals: null, shares: null,
      payment: { cards: [], cardTotal: 0, pixPaid: 0, pixPending: 0, other: 0, hasPix: market === 'BR' }, today: null, alerts: [],
      stepStatus: [], shareSeries: [], context: [], mediaSessTotal: 0, crmSessTotal: 0, directSessTotal: 0, organicSessTotal: 0, paidOrdersTotal: 0,
    });
  }
}

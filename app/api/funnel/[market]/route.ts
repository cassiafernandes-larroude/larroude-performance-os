import { NextRequest, NextResponse } from 'next/server';
import {
  getFunnelSeries, getFunnelTotals, getPaymentSeries,
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
      const [series, totals, payment, today] = await Promise.all([
        getFunnelSeries(market, since, until, gran),
        getFunnelTotals(market, since, until),
        getPaymentSeries(market, since, until),
        getFunnelTotals(market, 'today', 'today').catch(() => null),
      ]);

      const shares = {
        cartFromSessions: share(totals.addToCart, totals.sessions),
        checkoutFromCart: share(totals.reachedCheckout, totals.addToCart),
        completedFromCheckout: share(totals.completed, totals.reachedCheckout),
        overallCvr: share(totals.completed, totals.sessions),
      };

      const alerts: Array<{ step: string; todayRate: number; periodRate: number; dropPct: number }> = [];
      if (today && today.sessions >= 100) {
        const steps = [
          { label: 'Sessões → Carrinho', tn: today.addToCart, td: today.sessions, pn: totals.addToCart, pd: totals.sessions },
          { label: 'Carrinho → Checkout', tn: today.reachedCheckout, td: today.addToCart, pn: totals.reachedCheckout, pd: totals.addToCart },
          { label: 'Checkout → Pedido', tn: today.completed, td: today.reachedCheckout, pn: totals.completed, pd: totals.reachedCheckout },
        ];
        for (const s of steps) {
          const todayRate = share(s.tn, s.td);
          const periodRate = share(s.pn, s.pd);
          if (periodRate > 0 && todayRate < periodRate * 0.6 && s.td >= 30) {
            alerts.push({ step: s.label, todayRate, periodRate, dropPct: ((periodRate - todayRate) / periodRate) * 100 });
          }
        }
      }

      return { available: true, market, since, until, gran, series, totals, shares, payment, today, alerts };
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
      payment: { series: [], totals: null }, today: null, alerts: [],
    });
  }
}

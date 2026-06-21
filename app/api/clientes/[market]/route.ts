import { NextRequest, NextResponse } from 'next/server';
import {
  getLtvKpiSummary,
  getRetentionStats,
  getMonthlyLtvSeries,
  type Market,
} from '@/lib/ltv-dashboard/queries';
import { getNewVsReturning, getTopCustomers, getOpenOrders, getCohorts, type CustomerRow } from '@/lib/clientes/queries';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }
function isoDate(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// Cassia 2026-06-21: PII mascarada na borda — nunca enviamos email em claro ao cliente.
function maskEmail(e: string | null): string | null {
  if (!e || !e.includes('@')) return null;
  const [local, domain] = e.split('@');
  const head = local.slice(0, 2);
  return `${head}•••@${domain}`;
}
function displayName(first: string | null, last: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  const name = [f, l ? `${l[0]}.` : ''].filter(Boolean).join(' ').trim();
  return name || 'Cliente';
}
function maskRow(r: CustomerRow) {
  return {
    customerId: r.customerId,
    name: displayName(r.firstName, r.lastName),
    emailMasked: maskEmail(r.email),
    orders: r.orders,
    revenue: r.revenue,
    aov: r.aov,
    firstOrder: r.firstOrder,
    lastOrder: r.lastOrder,
    isReturning: r.isReturning,
  };
}

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const start = isoDate(url.searchParams.get('start'));
  const end = isoDate(url.searchParams.get('end'));
  if (!start || !end) return NextResponse.json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
  if (start > end) return NextResponse.json({ error: 'start must be <= end' }, { status: 400 });

  const currency = market === 'US' ? 'USD' : 'BRL';
  try {
    const cacheKey = `clientes:${market}:${start}:${end}`;
    const result = await memo(cacheKey, TTL_6H, async () => {
      const [summary, retention, monthly, nvr, top, open, cohorts] = await Promise.all([
        getLtvKpiSummary(market, start, end),
        getRetentionStats(market),
        getMonthlyLtvSeries(market),
        getNewVsReturning(market, start, end),
        getTopCustomers(market, start, end, 500),
        getOpenOrders(market, 50),
        getCohorts(market),
      ]);

      const kpis = {
        totalCustomers: summary.totalCustomers,
        returningCustomerRate: summary.returningCustomerRate,
        repeatPurchaseRate: summary.repeatPurchaseRate,
        aov: summary.aov,
        purchaseFrequency: summary.purchaseFrequency,
        customerLifetime: summary.customerLifetime,
        ltvPredictive: summary.ltvPredictive,
        ltvHistorical: summary.ltvHistorical,
        ltvMedian: summary.ltvMedian,
        ltvP75: summary.ltvP75,
        ltvP90: summary.ltvP90,
        medianDaysBetweenPurchases: summary.medianDaysBetweenPurchases,
        newCustomers: summary.newCustomers,
        totalOrders: summary.totalOrders,
        totalRevenue: summary.totalRevenue,
      };

      // Série mensal novos × recorrentes (recorrente = clientes do mês − novos do mês).
      const monthlySeries = monthly.map((m) => ({
        month: m.month,
        customers: m.customers,
        newCustomers: m.newCustomers,
        returningCustomers: Math.max(0, m.customers - m.newCustomers),
      }));

      const customers = top.map(maskRow);
      const openOrders = {
        totalOpenOrders: open.totalOpenOrders,
        totalOpenValue: open.totalOpenValue,
        customersWithOpen: open.customersWithOpen,
        currency: open.currency,
        byCustomer: open.byCustomer.map((c) => ({
          customerId: c.customerId,
          name: displayName(c.firstName, c.lastName),
          emailMasked: maskEmail(c.email),
          openOrders: c.openOrders,
          openValue: c.openValue,
          oldestDays: c.oldestDays,
        })),
      };

      return {
        available: true,
        market, start, end, currency,
        kpis, retention, newVsReturning: nvr, monthly: monthlySeries,
        customers, openOrders, cohorts,
      };
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/clientes]', market, msg);
    // Cassia 2026-06-21: NUNCA inventar — em falha devolve available:false (UI avisa), HTTP 200.
    return NextResponse.json({
      available: false, market, start, end, currency,
      error: msg,
      kpis: null, retention: null, newVsReturning: null, monthly: [], customers: [],
      openOrders: { totalOpenOrders: 0, totalOpenValue: 0, customersWithOpen: 0, currency, byCustomer: [] },
      cohorts: [],
    });
  }
}

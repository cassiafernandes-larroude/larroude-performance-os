import { NextRequest, NextResponse } from 'next/server';
import { getProductPerformance, type Market } from '@/lib/unit-economics/queries';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, dateRangeCompleted } from '@/lib/utils/periods';
import type { Period } from '@/types/metric';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }
const VALID: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

// Ranking + totais de performance de produto por periodo/market. Janela igual ao Main.
export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const cs = sp.get('start');
  const ce = sp.get('end');
  const periodParam = sp.get('period') as Period | null;

  let start: string;
  let end: string;
  if (cs && ce && /^\d{4}-\d{2}-\d{2}$/.test(cs) && /^\d{4}-\d{2}-\d{2}$/.test(ce)) {
    start = cs; end = ce;
  } else {
    const period: Period = periodParam && VALID.includes(periodParam) ? periodParam : '28d';
    const r = (period === '3M' || period === '6M' || period === '12M') ? dateRangeForPeriod(period) : dateRangeCompleted(period);
    start = r.from; end = r.to;
  }

  try {
    const rows = await memo(`pp:${market}:${start}:${end}:v1`, TTL_30M, () => getProductPerformance(market, start, end));
    const totalUnits = rows.reduce((s, r) => s + r.units, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    return NextResponse.json(
      { market, start, end, totalUnits, totalRevenue, productCount: rows.length, products: rows },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/product-performance]', market, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

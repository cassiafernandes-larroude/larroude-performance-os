// Cassia 2026-06-30: sessões + conversão por página de produto (aba Performance de Produto).
// Fonte ShopifyQL sessions (/products/<handle>) enriquecido com nome + SKUs. US|BR (ShopifyQL é por loja).
import { NextRequest, NextResponse } from 'next/server';
import { getProductPageSessions, type Market } from '@/lib/sessions/queries';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, dateRangeCompleted } from '@/lib/utils/periods';
import type { Period } from '@/types/metric';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

const VALID: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];
function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

function resolveRange(sp: URLSearchParams): { start: string; end: string } {
  const cs = sp.get('start'), ce = sp.get('end');
  if (cs && ce && /^\d{4}-\d{2}-\d{2}$/.test(cs) && /^\d{4}-\d{2}-\d{2}$/.test(ce)) return { start: cs, end: ce };
  const pp = sp.get('period') as Period | null;
  const period: Period = pp && VALID.includes(pp) ? pp : '28d';
  const r = (period === '3M' || period === '6M' || period === '12M') ? dateRangeForPeriod(period) : dateRangeCompleted(period);
  return { start: r.from, end: r.to };
}

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Sessões por produto disponível só para US ou BR.' }, { status: 400 });
  const { start, end } = resolveRange(req.nextUrl.searchParams);
  try {
    const products = await memo(`prod-sessions:${market}:${start}:${end}:v1`, TTL_30M, () => getProductPageSessions(market, start, end));
    return NextResponse.json({ market, start, end, products }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/product-performance/product-sessions]', market, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

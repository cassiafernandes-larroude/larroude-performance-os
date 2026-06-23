import { NextRequest, NextResponse } from 'next/server';
import { getPreorderFunnel, type Market } from '@/lib/product-funnel/queries';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const TTL_10M = 10 * 60 * 1000;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  try {
    const result = await memo(`preorder-funnel:v1:${market}`, TTL_10M, () => getPreorderFunnel(market));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/product-funnel]', market, msg);
    return NextResponse.json({ available: false, reason: 'error', error: msg, spendOk: false, drops: [] });
  }
}

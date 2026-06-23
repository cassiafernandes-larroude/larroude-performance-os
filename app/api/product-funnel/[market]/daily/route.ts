import { NextRequest, NextResponse } from 'next/server';
import { getProductDaily, type Market } from '@/lib/product-funnel/queries';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;
const TTL_10M = 10 * 60 * 1000;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const handle = sp.get('handle') || '';
  const sku = sp.get('sku') || '';
  const since = sp.get('since') || '';
  if (!handle || !sku || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ error: 'handle, sku e since (YYYY-MM-DD) obrigatórios' }, { status: 400 });
  }
  try {
    const points = await memo(`pf-daily:${market}:${handle}:${since}`, TTL_10M, () => getProductDaily(market, handle, sku, since));
    return NextResponse.json({ available: true, points });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ available: false, error: msg, points: [] });
  }
}

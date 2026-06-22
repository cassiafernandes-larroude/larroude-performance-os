import { NextRequest, NextResponse } from 'next/server';
import { getDropProducts } from '@/lib/calendar/results';
import { asanaConfigured } from '@/lib/calendar/asana';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const TTL_10M = 10 * 60 * 1000;

function isMarket(v: string): v is 'US' | 'BR' { return v === 'US' || v === 'BR'; }

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  const tag = new URL(req.url).searchParams.get('tag') || '';
  if (!/^[A-Za-z0-9._-]+$/.test(tag)) return NextResponse.json({ error: 'tag inválida' }, { status: 400 });
  if (!asanaConfigured()) return NextResponse.json({ available: false, reason: 'asana_token', products: [] });
  try {
    const products = await memo(`dropskus:${market}:${tag}`, TTL_10M, () => getDropProducts(market, tag));
    return NextResponse.json({ available: true, market, tag, products });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ available: false, reason: 'error', error: msg, products: [] });
  }
}

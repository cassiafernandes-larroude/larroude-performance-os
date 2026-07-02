import { NextRequest, NextResponse } from 'next/server';
import { getPreorderFunnel, DEFAULT_WINDOW_DAYS, type Market } from '@/lib/product-funnel/queries';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const TTL_10M = 10 * 60 * 1000;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

// Cassia 2026-07-02: janela do drop parametrizável via ?window= (dias; default 14, cap 1-90).
function parseWindow(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get('window');
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 90) return DEFAULT_WINDOW_DAYS;
  return n;
}

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  const windowDays = parseWindow(req);
  try {
    const result = await memo(`preorder-funnel:v3:${market}:w${windowDays}`, TTL_10M, () => getPreorderFunnel(market, windowDays));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/product-funnel]', market, msg);
    return NextResponse.json({ available: false, reason: 'error', error: msg, spendOk: false, drops: [] });
  }
}

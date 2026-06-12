/**
 * Shopify Last-Click attribution para Klaviyo.
 * REPLICATION-GUIDE Section 6.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Market, Period } from '@/lib/klaviyo/types';
import { periodToRange } from '@/lib/klaviyo/period';
import { shopifyLastClickKlaviyo } from '@/lib/klaviyo/shopify';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') as Period) || '28d';
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const range = periodToRange(period, market, from, to);
  const cacheKey = `klaviyo-shopify-attr:${market}:${range.start}:${range.end}:v1`;

  try {
    const result = await memo(cacheKey, TTL_6H, async () => {
      const attr = await shopifyLastClickKlaviyo(market, range);
      return { market, period: range, ...attr };
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=43200' } });
  } catch (err) {
    return NextResponse.json({ error: 'Shopify attribution failed', detail: (err as Error).message }, { status: 500 });
  }
}

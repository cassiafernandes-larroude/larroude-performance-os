import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { bucketDate } from '@/lib/klaviyo/utils';
import { shopifyLastClickKlaviyoDaily, isShopifyConfigured } from '@/lib/klaviyo/shopify';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const days = rangeDays(range);
  const granularity: 'day'|'week'|'month' = days <= 40 ? 'day' : days <= 90 ? 'week' : 'month';

  if (!isShopifyConfigured(market)) {
    return { generatedAt: new Date().toISOString(), market, period, range, granularity, available: false, points: [], total: 0 };
  }

  const raw = await shopifyLastClickKlaviyoDaily(market, range).catch((e: any) => {
    console.error('Shopify last-click error', e?.message);
    throw e;
  });
  const byBucket = new Map<string, number>();
  for (const p of raw) {
    const b = bucketDate(p.date, granularity);
    byBucket.set(b, (byBucket.get(b) || 0) + p.value);
  }
  const dates = Array.from(byBucket.keys()).sort();
  const points = dates.map(d => ({ date: d, value: byBucket.get(d) || 0 }));
  const total = points.reduce((s, p) => s + p.value, 0);

  return { generatedAt: new Date().toISOString(), market, period, range, granularity, available: true, points, total };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['shopify-attribution-v6', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'shopify-attribution')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

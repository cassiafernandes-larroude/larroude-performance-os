import { NextRequest, NextResponse } from 'next/server';
import { getProductUeTimeseries, type Market, type UeBucketGranularity } from '@/lib/unit-economics/queries';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, granularityForDays, daysBetween } from '@/lib/utils/periods';
import type { Period } from '@/types/metric';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}

const VALID_PERIODS: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

// Cassia 2026-06-17: serie temporal de unit economics por produto (mother SKU).
// Aceita ?sku=...&period=28d  OU  ?sku=...&start=YYYY-MM-DD&end=YYYY-MM-DD (custom).
// Granularidade = mesma regra do Main (<=28d dia, <=90d semana, senao mes).
export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const sku = sp.get('sku');
  if (!sku) return NextResponse.json({ error: 'Missing sku' }, { status: 400 });

  const customStart = sp.get('start');
  const customEnd = sp.get('end');
  const periodParam = sp.get('period') as Period | null;

  let start: string;
  let end: string;
  if (customStart && customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
    start = customStart;
    end = customEnd;
  } else {
    const period: Period = periodParam && VALID_PERIODS.includes(periodParam) ? periodParam : '28d';
    const range = dateRangeForPeriod(period);
    start = range.from;
    end = range.to;
  }

  const granularity: UeBucketGranularity = granularityForDays(daysBetween(start, end));

  try {
    const cacheKey = `ue-ts:${market}:${sku}:${start}:${end}:${granularity}:v1`;
    const buckets = await memo(cacheKey, TTL_30M, () =>
      getProductUeTimeseries(market, sku, start, end, granularity)
    );
    return NextResponse.json(
      { market, sku, start, end, granularity, buckets },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/unit-economics/timeseries]', market, sku, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

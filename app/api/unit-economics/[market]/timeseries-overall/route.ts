import { NextRequest, NextResponse } from 'next/server';
import { getOverallUeTimeseries, type Market, type UeBucketGranularity } from '@/lib/unit-economics/queries';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, dateRangeCompleted, granularityForDays, daysBetween } from '@/lib/utils/periods';
import { parseFulfillmentCategories } from '@/lib/shared/fulfillment-category';
import { getPreorderMotherSkus } from '@/lib/shared/preorder-skus';
import type { Period } from '@/types/metric';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }
const VALID_PERIODS: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

// Cassia 2026-06-26: série temporal de unit economics GERAL (todos os SKUs agregados).
// Mesma granularidade/períodos do gráfico por SKU; sem parâmetro sku.
export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const customStart = sp.get('start');
  const customEnd = sp.get('end');
  const periodParam = sp.get('period') as Period | null;
  const fulCats = parseFulfillmentCategories(sp.get('fulCats'));

  let start: string;
  let end: string;
  let granularity: UeBucketGranularity;
  if (customStart && customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
    start = customStart;
    end = customEnd;
    granularity = granularityForDays(daysBetween(start, end));
  } else {
    const period: Period = periodParam && VALID_PERIODS.includes(periodParam) ? periodParam : '28d';
    if (period === '3M' || period === '6M' || period === '12M') {
      const range = dateRangeForPeriod(period);
      start = range.from;
      end = range.to;
      granularity = period === '3M' ? 'week' : 'month';
    } else {
      const range = dateRangeCompleted(period);
      start = range.from;
      end = range.to;
      granularity = 'day';
    }
  }

  try {
    if (fulCats?.length) await getPreorderMotherSkus(market);
    const fulKey = fulCats && fulCats.length ? fulCats.slice().sort().join('+') : 'all';
    const cacheKey = `ue-ts-all:${market}:${start}:${end}:${granularity}:${fulKey}:v1`;
    const buckets = await memo(cacheKey, TTL_30M, () =>
      getOverallUeTimeseries(market, start, end, granularity, fulCats)
    );
    return NextResponse.json(
      { market, start, end, granularity, buckets },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/unit-economics/timeseries-overall]', market, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

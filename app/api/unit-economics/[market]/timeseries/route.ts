import { NextRequest, NextResponse } from 'next/server';
import { getProductUeTimeseries, type Market, type UeBucketGranularity } from '@/lib/unit-economics/queries';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, dateRangeCompleted, granularityForDays, daysBetween } from '@/lib/utils/periods';
import { parseFulfillmentCategories } from '@/lib/shared/fulfillment-category';
import { getPreorderMotherSkus } from '@/lib/shared/preorder-skus';
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
    // Granularidade igual ao Main (REGRAS 5.1/6.1): 7/14/28d -> dia, 3M -> semana, 6M/12M -> mes.
    if (period === '3M' || period === '6M' || period === '12M') {
      const range = dateRangeForPeriod(period); // monthly: alinhado ao 1o dia do mes inicial
      start = range.from;
      end = range.to;
      granularity = period === '3M' ? 'week' : 'month';
    } else {
      const range = dateRangeCompleted(period); // exato N dias (ate ontem) -> dia
      start = range.from;
      end = range.to;
      granularity = 'day';
    }
  }

  try {
    if (fulCats?.length) await getPreorderMotherSkus(market); // warm cache p/ exclusão pre-order
    const fulKey = fulCats && fulCats.length ? fulCats.slice().sort().join('+') : 'all';
    const cacheKey = `ue-ts:${market}:${sku}:${start}:${end}:${granularity}:${fulKey}:v2`;
    const buckets = await memo(cacheKey, TTL_30M, () =>
      getProductUeTimeseries(market, sku, start, end, granularity, fulCats)
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

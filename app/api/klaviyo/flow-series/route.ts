// /api/flow-series?market=US&period=L28D&flowId=XYZ
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { klaviyoFetch } from '@/lib/klaviyo/klaviyo';
import { placedOrderMetricId } from '@/lib/klaviyo/queries';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function load(market: Market, period: Period, flowId: string, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const days = rangeDays(range);
  const interval: 'daily'|'weekly'|'monthly' = days <= 40 ? 'daily' : days <= 90 ? 'weekly' : 'monthly';
  const conversion_metric_id = await placedOrderMetricId(market);
  const body = {
    data: {
      type: 'flow-series-report',
      attributes: {
        timeframe: { start: range.start, end: range.end },
        interval,
        statistics: ['opens_unique','clicks_unique','conversions','conversion_value','recipients','delivered','open_rate','click_rate','revenue_per_recipient'],
        conversion_metric_id,
        filter: `equals(flow_id,"${flowId}")`
      }
    }
  };
  const resp: any = await klaviyoFetch({ market, path: '/flow-series-reports/', method: 'POST', body });
  const attrs = resp?.data?.attributes;
  const dates: string[] = attrs?.date_times || [];
  const results: any[] = attrs?.results || [];
  // Agregamos todos os results em arrays únicos (caso group_by retorne múltiplos)
  const recipients: number[] = new Array(dates.length).fill(0);
  const opens: number[] = new Array(dates.length).fill(0);
  const clicks: number[] = new Array(dates.length).fill(0);
  const conversions: number[] = new Array(dates.length).fill(0);
  const revenue: number[] = new Array(dates.length).fill(0);
  for (const r of results) {
    const s: Record<string, number[]> = r?.statistics || {};
    for (let i = 0; i < dates.length; i++) {
      recipients[i] += (s.recipients?.[i] || 0);
      opens[i] += (s.opens_unique?.[i] || 0);
      clicks[i] += (s.clicks_unique?.[i] || 0);
      conversions[i] += (s.conversions?.[i] || 0);
      revenue[i] += (s.conversion_value?.[i] || 0);
    }
  }
  const points = dates.map((d, i) => {
    const rec = recipients[i] || 0;
    return {
      date: d.slice(0, 10),
      recipients: rec, opens: opens[i] || 0, clicks: clicks[i] || 0,
      conversions: conversions[i] || 0, revenue: revenue[i] || 0,
      openRate: rec ? ((opens[i] || 0) / rec) * 100 : 0,
      clickRate: rec ? ((clicks[i] || 0) / rec) * 100 : 0,
      rpr: rec ? ((revenue[i] || 0) / rec) : 0
    };
  });
  return { generatedAt: new Date().toISOString(), market, period, range, interval, flowId, points };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const flowId = req.nextUrl.searchParams.get('flowId') || '';
    if (!flowId) return NextResponse.json({ error: 'flowId required' }, { status: 400 });
    const fetcher = unstable_cache(() => load(market, period, flowId, custom), ['flow-series-v1', market, period, flowId, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'flows')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

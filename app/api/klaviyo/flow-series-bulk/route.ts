// /api/flow-series-bulk?market=US&period=L28D&flowIds=A,B,C
// UMA chamada Klaviyo com contains-any(flow_id, [...]) + group_by=['flow_id']
// Retorna aggregate + perFlow
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { klaviyoFetch } from '@/lib/klaviyo/klaviyo';
import { placedOrderMetricId } from '@/lib/klaviyo/queries';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function load(market: Market, period: Period, flowIds: string[], custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const days = rangeDays(range);
  const interval: 'daily'|'weekly'|'monthly' = days <= 40 ? 'daily' : days <= 90 ? 'weekly' : 'monthly';
  const conv = await placedOrderMetricId(market);

  // UMA chamada Klaviyo com contains-any + group_by=flow_id
  const idsList = flowIds.map(id => `"${id}"`).join(',');
  const body = {
    data: {
      type: 'flow-series-report',
      attributes: {
        timeframe: { start: range.start, end: range.end },
        interval,
        statistics: ['opens_unique','clicks_unique','conversions','conversion_value','recipients'],
        conversion_metric_id: conv,
        filter: `contains-any(flow_id,[${idsList}])`
      }
    }
  };

  let dates: string[] = [];
  const perFlow: Record<string, any[]> = {};
  const byDate = new Map<string, { recipients: number; opens: number; clicks: number; conversions: number; revenue: number }>();

  try {
    const resp: any = await klaviyoFetch({ market, path: '/flow-series-reports/', method: 'POST', body });
    const attrs = resp?.data?.attributes;
    dates = (attrs?.date_times || []).map((d: string) => d.slice(0, 10));
    const results: any[] = attrs?.results || [];
    // Sem group_by, todos os flows vêm agregados em 1 result
    for (const r of results) {
      const s: Record<string, number[]> = r?.statistics || {};
      for (let i = 0; i < dates.length; i++) {
        const rec = s.recipients?.[i] || 0;
        const op = s.opens_unique?.[i] || 0;
        const cl = s.clicks_unique?.[i] || 0;
        const conv2 = s.conversions?.[i] || 0;
        const rev = s.conversion_value?.[i] || 0;
        const cur = byDate.get(dates[i]) || { recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 };
        cur.recipients += rec; cur.opens += op; cur.clicks += cl; cur.conversions += conv2; cur.revenue += rev;
        byDate.set(dates[i], cur);
      }
    }
  } catch (e) {
    const msg = (e as Error).message || '';
    const isThrottled = /429|throttled/i.test(msg);
    return {
      generatedAt: new Date().toISOString(), market, period, range, interval,
      throttled: isThrottled,
      error: isThrottled ? 'Klaviyo rate limit. Aguarde 1 minuto e tente novamente.' : msg,
      points: [], perFlow: {}
    };
  }

  const points = dates.map(d => {
    const v = byDate.get(d) || { recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 };
    return {
      date: d, ...v,
      openRate: v.recipients ? (v.opens/v.recipients)*100 : 0,
      clickRate: v.recipients ? (v.clicks/v.recipients)*100 : 0,
      rpr: v.recipients ? v.revenue/v.recipients : 0
    };
  });

  return { generatedAt: new Date().toISOString(), market, period, range, interval, flowsRequested: flowIds.length, flowsLoaded: Object.keys(perFlow).length, points, perFlow };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const flowIds = (req.nextUrl.searchParams.get('flowIds') || '').split(',').filter(Boolean);
    if (flowIds.length === 0) return NextResponse.json({ error: 'flowIds required' }, { status: 400 });
    const key = ['flow-series-bulk-v3', market, period, custom?.start || '', custom?.end || '', flowIds.sort().join(',')];
    const fetcher = unstable_cache(() => load(market, period, flowIds, custom), key, { tags: [tag(market, 'flows')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

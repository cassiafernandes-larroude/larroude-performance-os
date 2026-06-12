// /api/flow-steps?market=US&period=L28D&flowId=X
// 1 call /flow-series-reports com group_by=[flow_id, flow_message_id] -> time-series por step
// 1 call /flow-values-reports com mesmo group_by -> totals por step
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { klaviyoFetch, klaviyoPaginate } from '@/lib/klaviyo/klaviyo';
import { placedOrderMetricId } from '@/lib/klaviyo/queries';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function load(market: Market, period: Period, flowId: string, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const days = rangeDays(range);
  const interval: 'daily'|'weekly'|'monthly' = days <= 40 ? 'daily' : days <= 90 ? 'weekly' : 'monthly';
  const conv = await placedOrderMetricId(market);

  // 1) Totals por step (group_by flow_id + flow_message_id no /flow-values-reports)
  const valuesBody = {
    data: {
      type: 'flow-values-report',
      attributes: {
        timeframe: { start: range.start, end: range.end },
        statistics: ['opens_unique','clicks_unique','conversions','conversion_value','recipients','delivered','unsubscribes','open_rate','click_rate','revenue_per_recipient'],
        conversion_metric_id: conv,
        filter: `equals(flow_id,"${flowId}")`,
        group_by: ['flow_id','flow_message_id','flow_message_name']
      }
    }
  };
  const valuesResp: any = await klaviyoFetch({ market, path: '/flow-values-reports/', method: 'POST', body: valuesBody });
  const valuesResults: any[] = valuesResp?.data?.attributes?.results || [];
  const totalsByMsg: Record<string, any> = {};
  for (const r of valuesResults) {
    const g = r?.groupings || {}; const s = r?.statistics || {};
    const id = g.flow_message_id;
    if (!id) continue;
    const rec = s.recipients || 0;
    totalsByMsg[id] = {
      messageId: id, name: g.flow_message_name || id,
      recipients: rec, opens: s.opens_unique || 0, clicks: s.clicks_unique || 0,
      conversions: s.conversions || 0, revenue: s.conversion_value || 0,
      openRate: (s.open_rate || 0) * 100,
      clickRate: (s.click_rate || 0) * 100,
      rpr: s.revenue_per_recipient || 0,
      unsubRate: rec ? ((s.unsubscribes || 0) / rec) * 100 : 0
    };
  }

  // 2) Time-series por step — UMA call com group_by
  const seriesBody = {
    data: {
      type: 'flow-series-report',
      attributes: {
        timeframe: { start: range.start, end: range.end },
        interval,
        statistics: ['opens_unique','clicks_unique','conversions','conversion_value','recipients','unsubscribes'],
        conversion_metric_id: conv,
        filter: `equals(flow_id,"${flowId}")`,
        group_by: ['flow_id','flow_message_id']
      }
    }
  };
  let dates: string[] = [];
  const seriesByMsg: Record<string, any> = {};
  try {
    const sResp: any = await klaviyoFetch({ market, path: '/flow-series-reports/', method: 'POST', body: seriesBody });
    const attrs = sResp?.data?.attributes || {};
    dates = (attrs.date_times || []).map((d: string) => d.slice(0, 10));
    const results: any[] = attrs.results || [];
    for (const r of results) {
      const id = r?.groupings?.flow_message_id; if (!id) continue;
      const s: Record<string, number[]> = r?.statistics || {};
      const recArr = s.recipients || [];
      const opArr = s.opens_unique || [];
      const clArr = s.clicks_unique || [];
      const revArr = s.conversion_value || [];
      const unsArr = s.unsubscribes || [];
      seriesByMsg[id] = {
        recipients: recArr, opens: opArr, clicks: clArr, conversions: s.conversions || [],
        revenue: revArr, unsubscribes: unsArr,
        openRate: recArr.map((rec, k) => rec ? ((opArr[k]||0)/rec)*100 : 0),
        clickRate: recArr.map((rec, k) => rec ? ((clArr[k]||0)/rec)*100 : 0),
        rpr: recArr.map((rec, k) => rec ? ((revArr[k]||0)/rec) : 0),
        unsubRate: recArr.map((rec, k) => rec ? ((unsArr[k]||0)/rec)*100 : 0)
      };
    }
  } catch (e) {
    // log do erro real
    (load as any).__lastSeriesError = (e as Error).message;
  }

  // Junta totals + series
  const messages = Object.values(totalsByMsg).sort((a: any, b: any) => {
    const am = a.name.match(/Step\s*(\d+)/i); const bm = b.name.match(/Step\s*(\d+)/i);
    if (am && bm) return Number(am[1]) - Number(bm[1]);
    return b.recipients - a.recipients;
  });

  const steps = messages.map((m: any, i: number) => {
    const ts = seriesByMsg[m.messageId];
    return {
      stepIndex: i + 1, messageId: m.messageId, name: m.name,
      revenue: ts?.revenue || [], recipients: ts?.recipients || [], opens: ts?.opens || [],
      clicks: ts?.clicks || [], conversions: ts?.conversions || [], unsubscribes: ts?.unsubscribes || [],
      openRate: ts?.openRate || [], clickRate: ts?.clickRate || [], rpr: ts?.rpr || [], unsubRate: ts?.unsubRate || [],
      totals: m
    };
  });

  return { generatedAt: new Date().toISOString(), market, period, range, interval, flowId, dates, stepCount: steps.length, steps, seriesError: (load as any).__lastSeriesError || null };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const flowId = req.nextUrl.searchParams.get('flowId') || '';
    if (!flowId) return NextResponse.json({ error: 'flowId required' }, { status: 400 });
    const fetcher = unstable_cache(() => load(market, period, flowId, custom), ['flow-steps-v6', market, period, flowId, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'flows')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

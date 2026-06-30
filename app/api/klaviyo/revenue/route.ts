import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { placedOrderMetricId, queryMetricAggregate, listCampaigns, campaignReports, listLiveFlows, flowReports, flowSeriesReport } from '@/lib/klaviyo/queries';
import { reportToMap, buildCampaignRows, buildFlowRows } from '@/lib/klaviyo/transform';
import { bucketDate } from '@/lib/klaviyo/utils';
import { parseFlowSeries } from '@/lib/klaviyo/series';
import { shopifyLastClickKlaviyoDaily, isShopifyConfigured } from '@/lib/klaviyo/shopify';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const days = rangeDays(range);
  const granularity: 'day'|'week'|'month' = days <= 40 ? 'day' : days <= 90 ? 'week' : 'month';
  const flowInterval: 'daily'|'weekly'|'monthly' = granularity === 'day' ? 'daily' : granularity === 'week' ? 'weekly' : 'monthly';
  const placedId = await placedOrderMetricId(market);

  const [shopifyAgg, camps, cReport, flowSeriesResp, lastClickRaw] = await Promise.all([
    placedId ? queryMetricAggregate(market, placedId, range, granularity as any, ['sum_value']) : Promise.resolve(null),
    listCampaigns(market, range),
    campaignReports(market, range),
    flowSeriesReport(market, range, flowInterval),
    isShopifyConfigured(market) ? shopifyLastClickKlaviyoDaily(market, range).catch(() => []) : Promise.resolve([])
  ]);
  const campaignRows = buildCampaignRows(camps, reportToMap(cReport));
  const flowSeries = parseFlowSeries(flowSeriesResp);

  const seriesMap = new Map<string, { date: string; shopify: number; klaviyoCampaign: number; klaviyoFlow: number; lastClick: number; }>();
  function ensure(date: string) {
    if (!seriesMap.has(date)) seriesMap.set(date, { date, shopify: 0, klaviyoCampaign: 0, klaviyoFlow: 0, lastClick: 0 });
    return seriesMap.get(date)!;
  }

  if (shopifyAgg) {
    const attrs = (shopifyAgg as any)?.data?.attributes;
    const dates: string[] = attrs?.dates || [];
    let vals: number[] = [];
    const d0: any = attrs?.data?.[0];
    if (d0?.measurements?.sum_value) vals = d0.measurements.sum_value;
    else if (Array.isArray(d0?.values)) vals = d0.values;
    dates.forEach((d, i) => {
      const date = d.slice(0, 10);
      ensure(date).shopify = vals[i] || 0;
    });
  }

  for (const r of campaignRows) {
    if (!r.sendDate) continue;
    const date = bucketDate(r.sendDate.slice(0, 10), granularity);
    ensure(date).klaviyoCampaign += r.revenue;
  }

  for (const f of flowSeries) {
    const date = bucketDate(f.date, granularity);
    ensure(date).klaviyoFlow += f.revenue;
  }

  // Shopify Last-Click = Klaviyo, bucketizado
  for (const lc of (lastClickRaw || [])) {
    const date = bucketDate(lc.date, granularity);
    ensure(date).lastClick += lc.value;
  }

  const points = Array.from(seriesMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(p => ({
      ...p,
      klaviyoTotal: p.klaviyoCampaign + p.klaviyoFlow,
      pctAttributed: p.shopify ? (p.lastClick / p.shopify) * 100 : 0,
      pctKlaviyoReported: p.shopify ? ((p.klaviyoCampaign + p.klaviyoFlow) / p.shopify) * 100 : 0
    }));

  const totals = points.reduce((acc, p) => ({
    shopify: acc.shopify + p.shopify,
    klaviyoCampaign: acc.klaviyoCampaign + p.klaviyoCampaign,
    klaviyoFlow: acc.klaviyoFlow + p.klaviyoFlow,
    lastClick: acc.lastClick + p.lastClick
  }), { shopify: 0, klaviyoCampaign: 0, klaviyoFlow: 0, lastClick: 0 });

  return {
    generatedAt: new Date().toISOString(), market, period, range, granularity, points, totals,
    emailParticipationPct: totals.shopify ? (totals.lastClick / totals.shopify) * 100 : 0,
    klaviyoReportedPct: totals.shopify ? ((totals.klaviyoCampaign + totals.klaviyoFlow) / totals.shopify) * 100 : 0
  };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['revenue-v4', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'revenue')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

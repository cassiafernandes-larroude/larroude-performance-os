import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { listCampaigns, campaignReports, listLiveFlows, flowReports, flowSeriesReport, placedOrderMetricId, queryMetricAggregate } from '@/lib/klaviyo/queries';
import { reportToMap, buildCampaignRows, buildFlowRows } from '@/lib/klaviyo/transform';
import { bucketCampaigns, parseFlowSeries } from '@/lib/klaviyo/series';
import { bucketDate } from '@/lib/klaviyo/utils';
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

  // Removido Shopify last-click daqui — agora carrega em /api/shopify-attribution (streaming UX)
  const [camps, flows, cReport, fReport, fSeries, shopifyAgg] = await Promise.all([
    listCampaigns(market, range),
    listLiveFlows(market),
    campaignReports(market, range),
    flowReports(market, range),
    flowSeriesReport(market, range, flowInterval),
    placedId ? queryMetricAggregate(market, placedId, range, granularity as any, ['sum_value']) : Promise.resolve(null)
  ]);
  const lastClickRaw: { date: string; value: number }[] = [];
  const cMap = reportToMap(cReport);
  const fMap = reportToMap(fReport);
  const campaignRows = buildCampaignRows(camps, cMap).filter(r => r.recipients > 0);
  const flowRows = buildFlowRows(flows, fMap).filter(r => !r.isCS && r.recipients > 0);

  const sum = (a: number[]) => a.reduce((x,y) => x+y, 0);
  const avg = (a: number[]) => a.length ? sum(a)/a.length : 0;

  const campaignsTotal = {
    count: campaignRows.length,
    revenue: sum(campaignRows.map(r => r.revenue)),
    recipients: sum(campaignRows.map(r => r.recipients)),
    delivered: sum(campaignRows.map(r => r.delivered)),
    opens: sum(campaignRows.map(r => r.opens)),
    clicks: sum(campaignRows.map(r => r.clicks)),
    conversions: sum(campaignRows.map(r => r.conversions)),
    openRate: avg(campaignRows.map(r => r.openRate)),
    clickRate: avg(campaignRows.map(r => r.clickRate)),
    rpr: avg(campaignRows.map(r => r.rpr))
  };
  const flowsTotal = {
    count: flowRows.length,
    revenue: sum(flowRows.map(r => r.revenue)),
    recipients: sum(flowRows.map(r => r.recipients)),
    opens: sum(flowRows.map(r => r.opens)),
    clicks: sum(flowRows.map(r => r.clicks)),
    conversions: sum(flowRows.map(r => r.conversions)),
    openRate: avg(flowRows.map(r => r.openRate)),
    clickRate: avg(flowRows.map(r => r.clickRate)),
    rpr: avg(flowRows.map(r => r.rpr))
  };

  // Daily series
  const series = bucketCampaigns(campaignRows, granularity);     // camps daily
  const flowsSeries = parseFlowSeries(fSeries);                  // flows daily

  // Shopify last-click attribution (referring_channel = klaviyo) — daily
  const lastClickSeries: { date: string; value: number }[] = (lastClickRaw || []).map((p: any) => ({ date: bucketDate(p.date, granularity), value: p.value }));

  // Shopify daily series
  const shopifySeries: { date: string; value: number }[] = [];
  if (shopifyAgg) {
    const attrs = (shopifyAgg as any)?.data?.attributes;
    const dates: string[] = attrs?.dates || [];
    const d0: any = attrs?.data?.[0];
    let vals: number[] = [];
    if (d0?.measurements?.sum_value) vals = d0.measurements.sum_value;
    else if (Array.isArray(d0?.values)) vals = d0.values;
    dates.forEach((d, i) => shopifySeries.push({ date: bucketDate(d.slice(0, 10), granularity), value: vals[i] || 0 }));
  }

  // Merge into combined series por data, com camps + flows + shopify lado a lado
  const dateSet = new Set<string>();
  for (const s of series) dateSet.add(s.date);
  for (const s of flowsSeries) dateSet.add(s.date);
  for (const s of shopifySeries) dateSet.add(s.date);
  for (const s of lastClickSeries) dateSet.add(s.date);
  const allDates = Array.from(dateSet).sort();

  // Agrega last-click no mesmo bucket
  const lastClickByDate = new Map<string, number>();
  for (const p of lastClickSeries) lastClickByDate.set(p.date, (lastClickByDate.get(p.date) || 0) + p.value);

  const compareSeries = allDates.map(date => {
    const c = series.find(p => p.date === date);
    const f = flowsSeries.find(p => p.date === date);
    const s = shopifySeries.find(p => p.date === date);
    const lc = lastClickByDate.get(date) || 0;
    return {
      date,
      campRevenue: c?.revenue || 0,
      flowRevenue: f?.revenue || 0,
      totalRevenue: (c?.revenue || 0) + (f?.revenue || 0),
      campRecipients: c?.recipients || 0,
      flowRecipients: f?.recipients || 0,
      campConversions: c?.conversions || 0,
      flowConversions: f?.conversions || 0,
      campOpenRate: c?.openRate || 0,
      flowOpenRate: f?.openRate || 0,
      campClickRate: c?.clickRate || 0,
      flowClickRate: f?.clickRate || 0,
      campRpr: c?.rpr || 0,
      flowRpr: f?.rpr || 0,
      shopifyTotal: s?.value || 0,
      shopifyLastClickKlaviyo: lc,
      klaviyoCampPct: s?.value ? ((c?.revenue || 0) / s.value) * 100 : 0,
      lastClickPct: s?.value ? (lc / s.value) * 100 : 0
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    market, period, range, granularity,
    campaigns: campaignsTotal,
    flows: flowsTotal,
    totalEmailRevenue: campaignsTotal.revenue + flowsTotal.revenue,
    series,
    compareSeries
  };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['overview-v6', market, period, custom?.start || '', custom?.end || ''], {
      tags: [tag(market, 'overview')], revalidate: 43200
    });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { listLiveFlows, flowReports, flowSeriesReport, listCampaigns, campaignReports } from '@/lib/klaviyo/queries';
import { reportToMap, buildFlowRows, buildCampaignRows } from '@/lib/klaviyo/transform';
import { bucketCampaigns, parseFlowSeries } from '@/lib/klaviyo/series';
import { priorRange, yoyRange, totalsFromRows, deltaBlock, emptyTotals } from '@/lib/klaviyo/delta';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function loadFlowTotals(market: Market, range: { start: string; end: string }) {
  try {
    const [meta, report] = await Promise.all([listLiveFlows(market), flowReports(market, range)]);
    const rows = buildFlowRows(meta, reportToMap(report)).filter(r => !r.isCS && r.recipients > 0);
    return totalsFromRows(rows);
  } catch { return emptyTotals(); }
}

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const days = rangeDays(range);
  const interval: 'daily'|'weekly'|'monthly' = days <= 40 ? 'daily' : days <= 90 ? 'weekly' : 'monthly';
  const pRange = priorRange(range);
  const yRange = yoyRange(range);

  // Só fetches essenciais de flows (sem campaigns — já tem em /api/campaigns)
  const [meta, report, flowSeries] = await Promise.all([
    listLiveFlows(market),
    flowReports(market, range),
    flowSeriesReport(market, range, interval)
  ]);
  const priorT = emptyTotals();
  const yoyT = emptyTotals();
  const rows = buildFlowRows(meta, reportToMap(report)).sort((a,b) => b.revenue - a.revenue);
  const liveActive = rows.filter(r => !r.isCS && r.recipients > 0);

  const flowsSeriesArr = parseFlowSeries(flowSeries);
  const campsSeries: any[] = []; // movido pra /api/campaigns

  const currentT = totalsFromRows(liveActive);
  const delta = deltaBlock(currentT, priorT, yoyT);

  return {
    generatedAt: new Date().toISOString(), market, period, range, interval, rows,
    flowsSeries: flowsSeriesArr,
    campsSeries,
    flowsWeekly: flowsSeriesArr,
    campsWeekly: campsSeries,
    totals: { ...currentT, count: liveActive.length },
    delta
  };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['flows-v3', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'flows')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

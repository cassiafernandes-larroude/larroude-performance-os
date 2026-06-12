import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange } from '@/lib/klaviyo/period';
import { listCampaigns, campaignReports, listLiveFlows, flowReports } from '@/lib/klaviyo/queries';
import { reportToMap, buildCampaignRows, buildFlowRows } from '@/lib/klaviyo/transform';
import { CAMPAIGN_BENCHMARKS, FLOW_BENCHMARKS, signalFor } from '@/lib/klaviyo/classify';
import type { Market, Period, BenchmarkRow, CampaignType, FlowType } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function aggregate<T extends string>(items: { type: T; openRate: number; clickRate: number; rpr: number }[], bms: Record<T, any>): BenchmarkRow[] {
  const groups: Record<string, { or: number[]; ctr: number[]; rpr: number[] }> = {};
  for (const r of items) {
    if (!groups[r.type]) groups[r.type] = { or: [], ctr: [], rpr: [] };
    groups[r.type].or.push(r.openRate);
    groups[r.type].ctr.push(r.clickRate);
    groups[r.type].rpr.push(r.rpr);
  }
  const out: BenchmarkRow[] = [];
  for (const [type, a] of Object.entries(groups)) {
    const avg = (arr: number[]) => arr.length ? arr.reduce((x,y)=>x+y,0)/arr.length : 0;
    const orPct = avg(a.or), ctrPct = avg(a.ctr), rpr = avg(a.rpr);
    const bm = bms[type as T];
    out.push({
      type, count: a.or.length,
      orPct, orBaseline: bm.orBaseline, orTarget: bm.orTarget,
      ctrPct, ctrBaseline: bm.ctrBaseline, ctrTarget: bm.ctrTarget,
      rpr, rprBaseline: bm.rprBaseline, rprTarget: bm.rprTarget,
      signal: signalFor(orPct, ctrPct, rpr, bm)
    });
  }
  return out.sort((a,b) => b.rpr - a.rpr);
}

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const [camps, cR, flows, fR] = await Promise.all([
    listCampaigns(market, range), campaignReports(market, range),
    listLiveFlows(market), flowReports(market, range)
  ]);
  const cRows = buildCampaignRows(camps, reportToMap(cR)).filter(r => r.recipients > 0);
  const fRows = buildFlowRows(flows, reportToMap(fR)).filter(r => !r.isCS && r.recipients > 0)
    .map(r => ({ type: r.flowType, openRate: r.openRate, clickRate: r.clickRate, rpr: r.rpr }));
  return {
    generatedAt: new Date().toISOString(), market, period, range,
    campaigns: aggregate<CampaignType>(cRows, CAMPAIGN_BENCHMARKS),
    flows: aggregate<FlowType>(fRows, FLOW_BENCHMARKS)
  };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['benchmarks-v2', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'benchmarks')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

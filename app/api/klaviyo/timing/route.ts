import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange } from '@/lib/klaviyo/period';
import { listCampaigns, campaignReports } from '@/lib/klaviyo/queries';
import { reportToMap, buildCampaignRows } from '@/lib/klaviyo/transform';
import type { Market, Period, DayOfWeekRow } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const [meta, report] = await Promise.all([listCampaigns(market, range), campaignReports(market, range)]);
  const rows = buildCampaignRows(meta, reportToMap(report)).filter(r => r.recipients > 0 && r.sendDate);

  const byDay: DayOfWeekRow[] = DAY_NAMES.map((dayName, dayIndex) => ({
    dayName, dayIndex, campaigns: 0, avgRevenue: 0, avgOpenRate: 0, avgCtr: 0, avgRpr: 0
  }));
  const acc: Record<number, { rev: number[]; or: number[]; ctr: number[]; rpr: number[] }> = {};
  for (let i=0;i<7;i++) acc[i] = { rev:[], or:[], ctr:[], rpr:[] };
  for (const r of rows) {
    const d = new Date(r.sendDate).getUTCDay();
    acc[d].rev.push(r.revenue);
    acc[d].or.push(r.openRate);
    acc[d].ctr.push(r.clickRate);
    acc[d].rpr.push(r.rpr);
  }
  byDay.forEach(d => {
    const a = acc[d.dayIndex];
    d.campaigns = a.rev.length;
    d.avgRevenue = a.rev.length ? a.rev.reduce((x,y)=>x+y,0)/a.rev.length : 0;
    d.avgOpenRate = a.or.length ? a.or.reduce((x,y)=>x+y,0)/a.or.length : 0;
    d.avgCtr = a.ctr.length ? a.ctr.reduce((x,y)=>x+y,0)/a.ctr.length : 0;
    d.avgRpr = a.rpr.length ? a.rpr.reduce((x,y)=>x+y,0)/a.rpr.length : 0;
  });

  return { generatedAt: new Date().toISOString(), market, period, range, byDay, hourNote: 'Hour-of-day analysis requires Klaviyo Events API export' };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['timing', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'timing')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

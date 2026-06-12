import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange } from '@/lib/klaviyo/period';
import { listCampaigns, campaignReports } from '@/lib/klaviyo/queries';
import { reportToMap, buildCampaignRows } from '@/lib/klaviyo/transform';
import { bucketCampaigns, granularityForPeriod } from '@/lib/klaviyo/series';
import { priorRange, yoyRange, totalsFromRows, deltaBlock, emptyTotals } from '@/lib/klaviyo/delta';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function loadTotalsForRange(market: Market, range: { start: string; end: string }) {
  try {
    const [meta, report] = await Promise.all([listCampaigns(market, range), campaignReports(market, range)]);
    const rows = buildCampaignRows(meta, reportToMap(report)).filter(r => r.recipients > 0);
    return totalsFromRows(rows);
  } catch { return emptyTotals(); }
}

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const pRange = priorRange(range);
  const yRange = yoyRange(range);
  const [meta, report] = await Promise.all([
    listCampaigns(market, range),
    campaignReports(market, range)
  ]);
  // Prior/yoy desabilitados pra evitar timeout
  const priorT = emptyTotals();
  const yoyT = emptyTotals();
  const rows = buildCampaignRows(meta, reportToMap(report)).filter(r => r.recipients > 0).sort((a,b) => b.revenue - a.revenue);
  const granularity = granularityForPeriod(period);
  const series = bucketCampaigns(rows, granularity);
  const currentT = totalsFromRows(rows);
  const delta = deltaBlock(currentT, priorT, yoyT);
  return {
    generatedAt: new Date().toISOString(), market, period, range, granularity,
    rows, series,
    totals: { ...currentT, count: rows.length },
    delta
  };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['campaigns-v2', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'campaigns')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

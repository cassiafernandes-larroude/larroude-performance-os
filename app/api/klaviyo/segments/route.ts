import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange } from '@/lib/klaviyo/period';
import { listSegments, listCampaigns, campaignReports } from '@/lib/klaviyo/queries';
import { reportToMap } from '@/lib/klaviyo/transform';
import { klaviyoPaginate } from '@/lib/klaviyo/klaviyo';
import type { Market, Period, SegmentRow } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Também busca listas (audiences.included pode ter ambos)
async function listLists(market: Market) {
  return klaviyoPaginate<any>(market, '/lists', { 'fields[list]': 'name' });
}

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const [segs, lists, camps, report] = await Promise.all([
    listSegments(market),
    listLists(market),
    listCampaigns(market, range),
    campaignReports(market, range)
  ]);

  // mapa de "audiência" (segment OU list) → nome
  const audMap = new Map<string, { name: string; kind: 'segment' | 'list' }>();
  for (const s of segs as any[]) audMap.set(s.id, { name: s.attributes?.name || '(unnamed)', kind: 'segment' });
  for (const l of lists as any[]) {
    if (!audMap.has(l.id)) audMap.set(l.id, { name: l.attributes?.name || '(unnamed list)', kind: 'list' });
  }

  // reports por campaign_id → stats
  const reportMap = reportToMap(report);

  // Agregação por audience id usando o RAW campaign data (que contém audiences.included)
  const agg: Record<string, SegmentRow & { kind: string; campCount: number }> = {};
  for (const c of camps as any[]) {
    const a = c.attributes || {};
    const included: string[] = a.audiences?.included || [];
    const stats = reportMap.get(c.id) || {};
    const recipients = Number(stats.recipients) || 0;
    const revenue = Number(stats.conversion_value) || 0;
    const opens = Number(stats.opens_unique) || 0;
    const clicks = Number(stats.clicks_unique) || 0;
    const delivered = Number(stats.delivered) || recipients;
    if (recipients === 0) continue;

    for (const audId of included) {
      const info = audMap.get(audId);
      if (!info) continue;
      if (!agg[audId]) agg[audId] = { id: audId, name: info.name, kind: info.kind, recipients: 0, revenue: 0, openRate: 0, clickRate: 0, rpr: 0, campCount: 0 };
      agg[audId].recipients += recipients;
      agg[audId].revenue += revenue;
      // weighted avg
      agg[audId].openRate += (opens / Math.max(1, delivered)) * 100 * recipients;
      agg[audId].clickRate += (clicks / Math.max(1, delivered)) * 100 * recipients;
      agg[audId].campCount += 1;
    }
  }

  const rows = Object.values(agg).map(r => ({
    id: r.id,
    name: r.name + (r.kind === 'list' ? ' (list)' : ''),
    recipients: r.recipients,
    revenue: r.revenue,
    openRate: r.recipients ? r.openRate / r.recipients : 0,
    clickRate: r.recipients ? r.clickRate / r.recipients : 0,
    rpr: r.recipients ? r.revenue / r.recipients : 0
  })).sort((a, b) => b.revenue - a.revenue);

  return { generatedAt: new Date().toISOString(), market, period, range, rows, totalSegments: segs.length, totalLists: lists.length, totalCampaignsWithAudience: camps.filter((c: any) => (c.attributes?.audiences?.included || []).length > 0).length };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['segments-v2', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'segments')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

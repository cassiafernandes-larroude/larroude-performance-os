import { NextRequest, NextResponse } from 'next/server';
import type { Market, Period } from '@/lib/klaviyo/types';
import { periodToRange } from '@/lib/klaviyo/period';
import { listCampaigns, campaignReports } from '@/lib/klaviyo/queries';
import { buildCampaignRows, aggregateRows } from '@/lib/klaviyo/transform';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') as Period) || '28d';
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const range = periodToRange(period, market, from, to);
  const cacheKey = `klaviyo-campaigns:${market}:${range.start}:${range.end}:v1`;
  const startedAt = Date.now();

  try {
    const result = await memo(cacheKey, TTL_6H, async () => {
      const campaigns = await listCampaigns(market, range);
      const reports = await campaignReports(market, range, campaigns.map((c: any) => c.id)).catch(() => []);
      const rows = buildCampaignRows(campaigns, reports);
      const totals = aggregateRows(rows);
      return {
        market,
        period: { start: range.start, end: range.end },
        rows: rows.sort((a, b) => b.revenue - a.revenue),
        totals: {
          ...totals,
          openRate: totals.delivered > 0 ? totals.opens / totals.delivered : 0,
          clickRate: totals.delivered > 0 ? totals.clicks / totals.delivered : 0,
          unsubRate: totals.delivered > 0 ? totals.unsubscribes / totals.delivered : 0,
          revenuePerRecipient: totals.recipients > 0 ? totals.revenue / totals.recipients : 0,
        },
      };
    });
    return NextResponse.json(
      { ...result, durationMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=43200' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Klaviyo campaigns failed', detail: msg }, { status: 500 });
  }
}

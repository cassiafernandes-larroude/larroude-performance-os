/**
 * /api/klaviyo/overview/{market}?period=28d&from=...&to=...
 *
 * Retorna KPIs consolidados (campaigns + flows + list health).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Market, Period } from '@/lib/klaviyo/types';
import { periodToRange, priorRange, pctChange } from '@/lib/klaviyo/period';
import { listCampaigns, listFlows, campaignReports, flowReports, listHealthAggregate } from '@/lib/klaviyo/queries';
import { buildCampaignRows, buildFlowRows, aggregateRows } from '@/lib/klaviyo/transform';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') as Period) || '28d';
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;

  const range = periodToRange(period, market, from, to);
  const cacheKey = `klaviyo-overview:${market}:${range.start}:${range.end}:v1`;
  const startedAt = Date.now();

  try {
    const result = await memo(cacheKey, TTL_6H, async () => {
      const [campaigns, flows] = await Promise.all([
        listCampaigns(market, range),
        listFlows(market),
      ]);

      // SERIALIZAR — não paralelizar (rate limit Klaviyo)
      const campaignIds = campaigns.map((c: any) => c.id);
      const flowIds = flows.map((f: any) => f.id);
      const campReports = await campaignReports(market, range, campaignIds).catch((e) => {
        console.warn(`[klaviyo overview] campaign reports failed: ${e.message}`);
        return [];
      });
      const flwReports = await flowReports(market, range, flowIds).catch((e) => {
        console.warn(`[klaviyo overview] flow reports failed: ${e.message}`);
        return [];
      });

      const camps = buildCampaignRows(campaigns, campReports);
      const flws = buildFlowRows(flows, flwReports);

      const campAgg = aggregateRows(camps);
      const flwAgg = aggregateRows(flws);
      const totalRevenue = campAgg.revenue + flwAgg.revenue;
      const totalRecipients = campAgg.recipients + flwAgg.recipients;
      const totalDelivered = campAgg.delivered + flwAgg.delivered;
      const totalOpens = campAgg.opens + flwAgg.opens;
      const totalClicks = campAgg.clicks + flwAgg.clicks;
      const totalUnsubs = campAgg.unsubscribes + flwAgg.unsubscribes;
      const totalOrders = campAgg.orders + flwAgg.orders;

      const listHealth = await listHealthAggregate(market, range).catch(() => ({ subs: 0, unsubs: 0, bounces: 0, spam: 0 }));

      return {
        market,
        period: { start: range.start, end: range.end },
        kpis: {
          totalRevenue,
          totalRecipients,
          totalDelivered,
          totalOpens,
          totalClicks,
          totalUnsubs,
          totalOrders,
          campaignsRevenue: campAgg.revenue,
          flowsRevenue: flwAgg.revenue,
          campaignsCount: camps.length,
          flowsCount: flws.length,
          openRate: totalDelivered > 0 ? totalOpens / totalDelivered : 0,
          clickRate: totalDelivered > 0 ? totalClicks / totalDelivered : 0,
          unsubRate: totalDelivered > 0 ? totalUnsubs / totalDelivered : 0,
          revenuePerRecipient: totalRecipients > 0 ? totalRevenue / totalRecipients : 0,
        },
        listHealth,
        topCampaigns: camps.sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        topFlows: flws.sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      };
    });

    return NextResponse.json(
      { ...result, durationMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=43200' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Klaviyo overview failed', detail: msg }, { status: 500 });
  }
}

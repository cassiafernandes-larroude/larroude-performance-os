/**
 * Insights: Green/Red flags + Next Steps.
 * Heurísticas baseadas em benchmarks Larroudé (REPLICATION-GUIDE Section 8).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Market, Period } from '@/lib/klaviyo/types';
import { periodToRange } from '@/lib/klaviyo/period';
import { listCampaigns, listFlows, campaignReports, flowReports } from '@/lib/klaviyo/queries';
import { buildCampaignRows, buildFlowRows, aggregateRows } from '@/lib/klaviyo/transform';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

type Flag = { kind: 'green' | 'red' | 'next'; title: string; body: string };

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') as Period) || '28d';
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const range = periodToRange(period, market, from, to);
  const cacheKey = `klaviyo-insights:${market}:${range.start}:${range.end}:v1`;

  try {
    const result = await memo(cacheKey, TTL_6H, async () => {
      const [campaigns, flows] = await Promise.all([listCampaigns(market, range), listFlows(market)]);
      const campReports = await campaignReports(market, range, campaigns.map((c: any) => c.id)).catch(() => []);
      const flwReports = await flowReports(market, range, flows.map((f: any) => f.id)).catch(() => []);
      const camps = buildCampaignRows(campaigns, campReports);
      const flws = buildFlowRows(flows, flwReports);
      const campAgg = aggregateRows(camps);
      const flwAgg = aggregateRows(flws);
      const totalRevenue = campAgg.revenue + flwAgg.revenue;

      const flags: Flag[] = [];

      // Green flag: revenue forte
      if (totalRevenue > 0) {
        const flowsShare = flwAgg.revenue / totalRevenue;
        if (flowsShare > 0.5) {
          flags.push({
            kind: 'green',
            title: `Flows responsible for ${(flowsShare * 100).toFixed(0)}% of CRM revenue`,
            body: `Flows are doing the heavy lifting — automation is paying off. Keep enrolling more profiles into Welcome + Browse Abandon to sustain.`,
          });
        }
      }

      // Red flag: open rate baixo
      const orCampaigns = campAgg.delivered > 0 ? campAgg.opens / campAgg.delivered : 0;
      if (camps.length > 5 && orCampaigns < 0.30) {
        flags.push({
          kind: 'red',
          title: `Campaign open rate below 30% (${(orCampaigns * 100).toFixed(1)}%)`,
          body: `Deliverability or subject lines may be weak. Check spam complaint rate, segment freshness, and run A/B tests on subject lines.`,
        });
      } else if (camps.length > 5 && orCampaigns > 0.55) {
        flags.push({
          kind: 'green',
          title: `Strong campaign open rate (${(orCampaigns * 100).toFixed(1)}%)`,
          body: `Above-average engagement. Your list is fresh and your subject lines are working. Consider scaling send frequency.`,
        });
      }

      // Red flag: unsub alto
      const unsubRate = campAgg.delivered > 0 ? campAgg.unsubscribes / campAgg.delivered : 0;
      if (unsubRate > 0.005) {
        flags.push({
          kind: 'red',
          title: `Unsubscribe rate above 0.5% (${(unsubRate * 100).toFixed(2)}%)`,
          body: `You're losing subscribers faster than industry average (0.2-0.3%). Reduce frequency, improve segmentation, or pause promotions to lapsed users.`,
        });
      }

      // Red flag: nenhum flow performando
      const bestFlowRev = Math.max(0, ...flws.map((f) => f.revenue));
      if (flws.length > 5 && bestFlowRev < (campAgg.revenue / Math.max(1, camps.length)) * 2) {
        flags.push({
          kind: 'red',
          title: 'Flows underperforming vs campaigns',
          body: `Your best flow generates less than 2× the average campaign. Audit Welcome series, Abandoned Checkout timing, and Post-Purchase triggers.`,
        });
      }

      // Next step: revenue zero
      if (totalRevenue === 0) {
        flags.push({
          kind: 'next',
          title: 'No revenue attributed in this period',
          body: `Check Klaviyo connection: Placed Order metric ID for ${market}, currency tracking, and UTM tagging on email links.`,
        });
      }

      // Next step: top flow recommendation
      const sortedFlows = flws.sort((a, b) => b.revenue - a.revenue);
      const topFlow = sortedFlows[0];
      if (topFlow) {
        flags.push({
          kind: 'next',
          title: `Scale top flow: ${topFlow.name}`,
          body: `Revenue $${topFlow.revenue.toFixed(0)} on ${topFlow.recipients} recipients. Verify segments feeding this flow have growth headroom — consider adding similar trigger logic.`,
        });
      }

      return { market, period: range, flags };
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=43200' } });
  } catch (err) {
    return NextResponse.json({ error: 'Klaviyo insights failed', detail: (err as Error).message }, { status: 500 });
  }
}

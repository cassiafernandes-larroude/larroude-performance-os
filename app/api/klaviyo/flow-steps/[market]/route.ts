/**
 * Flow Steps: time-series por step de UM flow específico (group_by [flow_id, flow_message_id]).
 * REPLICATION-GUIDE Section 5.2.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Market, Period } from '@/lib/klaviyo/types';
import { periodToRange } from '@/lib/klaviyo/period';
import { flowSeriesByStep } from '@/lib/klaviyo/series';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const flowId = url.searchParams.get('flowId');
  if (!flowId) return NextResponse.json({ error: 'Missing flowId param' }, { status: 400 });

  const period = (url.searchParams.get('period') as Period) || '28d';
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const range = periodToRange(period, market, from, to);
  const cacheKey = `klaviyo-flow-steps:${market}:${flowId}:${range.start}:${range.end}:v1`;

  try {
    const result = await memo(cacheKey, TTL_6H, async () => {
      const steps = await flowSeriesByStep(market, range, flowId);
      return { market, flowId, period: range, steps };
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=43200' } });
  } catch (err) {
    return NextResponse.json({ error: 'Klaviyo flow-steps failed', detail: (err as Error).message }, { status: 500 });
  }
}

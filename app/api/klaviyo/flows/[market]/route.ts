import { NextRequest, NextResponse } from 'next/server';
import type { Market, Period } from '@/lib/klaviyo/types';
import { periodToRange } from '@/lib/klaviyo/period';
import { listFlows, flowReports } from '@/lib/klaviyo/queries';
import { buildFlowRows, aggregateRows } from '@/lib/klaviyo/transform';
import { FLOW_CATEGORY_LABELS } from '@/lib/klaviyo/classify';
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
  const cacheKey = `klaviyo-flows:${market}:${range.start}:${range.end}:v1`;
  const startedAt = Date.now();

  try {
    const result = await memo(cacheKey, TTL_6H, async () => {
      const flows = await listFlows(market);
      const reports = await flowReports(market, range, flows.map((f: any) => f.id)).catch(() => []);
      const rows = buildFlowRows(flows, reports);
      const totals = aggregateRows(rows);

      // Agrupar por categoria
      const byCategory: Record<string, typeof rows> = {};
      for (const r of rows) {
        if (!byCategory[r.category]) byCategory[r.category] = [];
        byCategory[r.category].push(r);
      }
      const categoryTotals = Object.entries(byCategory).map(([cat, items]) => ({
        category: cat,
        label: FLOW_CATEGORY_LABELS[cat as keyof typeof FLOW_CATEGORY_LABELS] || cat,
        count: items.length,
        revenue: items.reduce((s, x) => s + x.revenue, 0),
        recipients: items.reduce((s, x) => s + x.recipients, 0),
      })).sort((a, b) => b.revenue - a.revenue);

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
        byCategory: categoryTotals,
      };
    });
    return NextResponse.json(
      { ...result, durationMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=43200' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Klaviyo flows failed', detail: msg }, { status: 500 });
  }
}

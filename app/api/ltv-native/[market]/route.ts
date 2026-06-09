import { NextRequest, NextResponse } from 'next/server';
import {
  getLtvKpiSummary,
  getDailyLtvSeries,
  getMonthlyLtvSeries,
  getRetentionStats,
  type Market,
} from '@/lib/ltv-dashboard/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

function isMarket(value: string): value is Market {
  return value === 'US' || value === 'BR';
}

function isoDate(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Fast endpoint — KPIs + daily series + monthly series only.
 * Returns in ~3-8s on cold start, <1s when cached.
 *
 * Product LTV is split into a separate endpoint /api/ltv/[market]/products
 * because the line_item UNNEST aggregation takes 15-30s for 12M windows.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { market: string } }
) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }

  const url = new URL(req.url);
  const start = isoDate(url.searchParams.get('start'));
  const end = isoDate(url.searchParams.get('end'));

  if (!start || !end) {
    return NextResponse.json(
      { error: 'start and end dates required (YYYY-MM-DD)' },
      { status: 400 }
    );
  }
  if (start > end) {
    return NextResponse.json({ error: 'start must be <= end' }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const [summary, daily, monthly, retention] = await Promise.all([
      getLtvKpiSummary(market, start, end),
      getDailyLtvSeries(market, start, end),
      getMonthlyLtvSeries(market),
      getRetentionStats(market),
    ]);

    return NextResponse.json(
      {
        summary,
        daily,
        monthly,
        retention,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          sources: summary.sources,
        },
      },
      {
        headers: {
          // Aggressive cache: 24h fresh, 7d stale-while-revalidate.
          // Cron at 08:00 BRT re-warms it daily.
          'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/ltv]', market, msg);
    return NextResponse.json(
      { error: 'Data fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

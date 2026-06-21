import { NextRequest, NextResponse } from 'next/server';
import {
  getLtvKpiSummary,
  getDailyLtvSeries,
  getMonthlyLtvSeries,
  getRetentionStats,
  type Market,
} from '@/lib/ltv-dashboard/queries';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(value: string): value is Market {
  return value === 'US' || value === 'BR';
}

function isoDate(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Fast endpoint — KPIs + daily series + monthly series + retention.
 * Cold start ~3-8s, in-memory cached <50ms, CDN cached <100ms.
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
    const cacheKey = `ltv:summary:v2-noexch:${market}:${start}:${end}`;
    const result = await memo(cacheKey, TTL_6H, async () => {
      const [summary, daily, monthly, retention] = await Promise.all([
        getLtvKpiSummary(market, start, end),
        getDailyLtvSeries(market, start, end),
        getMonthlyLtvSeries(market),
        getRetentionStats(market),
      ]);
      return { summary, daily, monthly, retention };
    });

    return NextResponse.json(
      {
        ...result,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          sources: result.summary.sources,
        },
      },
      {
        headers: {
          // Browser cacheia 30min, CDN cacheia 24h, serve stale 7d enquanto revalida.
          'Cache-Control':
            'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800',
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

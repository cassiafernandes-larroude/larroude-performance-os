import { NextRequest, NextResponse } from 'next/server';
import {
  getKpiSummary,
  getDailySeries,
  getMonthlySeries,
  getProductCac,
  type Market,
} from '@/lib/cac-dashboard/queries';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}

function isoDate(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * CAC endpoint nativo - KPIs + daily + monthly + produtos.
 * Pattern identico ao LTV-native: memo-cache 6h + headers HTTP agressivos.
 */
export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }

  const url = new URL(req.url);
  const start = isoDate(url.searchParams.get('start'));
  const end = isoDate(url.searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }
  if (start > end) {
    return NextResponse.json({ error: 'start must be <= end' }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const cacheKey = `cac:${market}:${start}:${end}`;
    const result = await memo(cacheKey, TTL_6H, async () => {
      const [summary, daily, monthly, productResult] = await Promise.all([
        getKpiSummary(market, start, end),
        getDailySeries(market, start, end),
        getMonthlySeries(market),
        getProductCac(market, start, end, 200),
      ]);
      return {
        summary,
        daily,
        monthly,
        products: productResult.products,
        productDaily: productResult.productDaily,
      };
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
          'Cache-Control':
            'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/cac-native]', market, msg);
    return NextResponse.json(
      { error: 'Data fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

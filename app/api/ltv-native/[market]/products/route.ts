import { NextRequest, NextResponse } from 'next/server';
import { getProductLtv, type Market } from '@/lib/ltv-dashboard/queries';

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
 * Heavy endpoint — Product LTV via UNNEST(line_items).
 * For 12M windows scans ~400MB and takes 15-30s on cold start.
 * Cached aggressively (24h) and pre-warmed daily by the cron.
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
    const result = await getProductLtv(market, start, end, 200);

    return NextResponse.json(
      {
        products: result.products,
        productDaily: result.productDaily,
        categories: result.categories,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      },
      {
        headers: {
          'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/ltv/products]', market, msg);
    return NextResponse.json(
      { error: 'Data fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

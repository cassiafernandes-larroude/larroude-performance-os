import { NextRequest, NextResponse } from 'next/server';
import { type Market } from '@/lib/cac-dashboard/queries';
import { getChannelCac } from '@/lib/cac-dashboard/channel-cac';
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
 * CAC by Channel — spend + new customers + CAC por canal.
 * Mesmo pattern do endpoint principal do CAC: memo-cache 6h + s-maxage=300.
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
    const cacheKey = `cac-channel:${market}:${start}:${end}`;
    const result = await memo(cacheKey, TTL_6H, () => getChannelCac(market, start, end));

    return NextResponse.json(
      {
        ...result,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/cac-native/channel-cac]', market, msg);
    return NextResponse.json(
      { error: 'Data fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

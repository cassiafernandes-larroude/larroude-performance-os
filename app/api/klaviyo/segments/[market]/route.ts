import { NextRequest, NextResponse } from 'next/server';
import type { Market } from '@/lib/klaviyo/types';
import { listSegments } from '@/lib/klaviyo/queries';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  const startedAt = Date.now();

  try {
    const result = await memo(`klaviyo-segments:${market}:v1`, TTL_6H, async () => {
      const segments = await listSegments(market);
      const rows = segments.map((s: any) => ({
        id: s.id,
        name: s?.attributes?.name || 'Unnamed',
        profileCount: Number(s?.attributes?.profile_count ?? 0),
        created: s?.attributes?.created || '',
      })).sort((a: any, b: any) => b.profileCount - a.profileCount);
      return { market, rows };
    });
    return NextResponse.json(
      { ...result, durationMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=43200' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Klaviyo segments failed', detail: msg }, { status: 500 });
  }
}

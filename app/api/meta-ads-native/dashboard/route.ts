import { NextRequest, NextResponse } from 'next/server';
import { buildDashboard } from '@/lib/meta-ads-native/aggregator';
import type { Period, Region } from '@/lib/meta-ads-native/types';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 min
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const region = (searchParams.get('region') || 'US') as Region;
    const period = (searchParams.get('period') || '28d') as Period;
    const since = searchParams.get('since') || undefined;
    const until = searchParams.get('until') || undefined;
    const customRange = since && until ? { since, until } : undefined;

    const t0 = Date.now();
    const data = await buildDashboard(region, period, customRange);
    const elapsed = Date.now() - t0;

    return NextResponse.json(data, {
      headers: {
        // Aggressive caching: browser 5min, CDN 10min, stale-while-revalidate 1h
        'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public',
        'X-Build-Time-Ms': String(elapsed),
      },
    });
  } catch (err: any) {
    console.error('[/api/dashboard]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load dashboard', detail: String(err) },
      { status: 500 }
    );
  }
}

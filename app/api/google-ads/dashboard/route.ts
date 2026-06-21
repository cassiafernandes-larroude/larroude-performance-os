import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAdsBundle, type Market } from '@/lib/google-ads-native/queries';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, dateRangeCompleted } from '@/lib/utils/periods';
import type { Period } from '@/types/metric';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }
const VALID: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = (sp.get('market') || 'US').toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const cs = sp.get('start'); const ce = sp.get('end');
  let start: string; let end: string;
  if (cs && ce && /^\d{4}-\d{2}-\d{2}$/.test(cs) && /^\d{4}-\d{2}-\d{2}$/.test(ce)) { start = cs; end = ce; }
  else {
    const periodParam = sp.get('period') as Period | null;
    const period: Period = periodParam && VALID.includes(periodParam) ? periodParam : '28d';
    const r = (period === '3M' || period === '6M' || period === '12M') ? dateRangeForPeriod(period) : dateRangeCompleted(period);
    start = r.from; end = r.to;
  }

  try {
    const data = await memo(`gads:${market}:${start}:${end}:v1`, TTL_30M, () => getGoogleAdsBundle(market, start, end));
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/google-ads/dashboard]', market, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

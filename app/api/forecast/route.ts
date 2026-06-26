// Cassia 2026-06-26: API da aba Forecast. Regra YoY (mesma estação 2025) × crescimento.
import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getForecast, type Market, type Level } from '@/lib/forecast/bq';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MARKETS: Market[] = ['US', 'BR'];
const LEVELS: Level[] = ['categoria', 'modelo', 'sku'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get('market') || 'US').toUpperCase() as Market;
  const level = (searchParams.get('level') || 'sku') as Level;
  const growth = Number(searchParams.get('growth') || '1.3');
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  if (!MARKETS.includes(market) || !LEVELS.includes(level)) {
    return NextResponse.json({ error: 'invalid market/level' }, { status: 400 });
  }

  try {
    const key = `forecast-${market}-${level}-${growth}-${from ?? 'd'}-${to ?? 'd'}`;
    const cached = unstable_cache(
      () => getForecast(market, level, { from, to, growth }),
      [key],
      { revalidate: 3600, tags: ['forecast'] }
    );
    const data = await cached();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400, public' },
    });
  } catch (e: any) {
    console.error('[forecast] BigQuery error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

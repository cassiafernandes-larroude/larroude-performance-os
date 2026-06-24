// Cassia 2026-06-24: remessas (Produção 2.0) interno ao OS — BigQuery silver direto.
// Antes era proxy ao app externo — removido. Cache server-side (unstable_cache, 15 min).
import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getRemessas } from '@/lib/producao/bq';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const getRemessasCached = unstable_cache(getRemessas, ['producao-remessas-v2'], {
  revalidate: 900,
  tags: ['producao'],
});

export async function GET() {
  try {
    const data = await getRemessasCached();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[producao/remessas] BigQuery error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// Cassia 2026-06-24: remessas (Produção 2.0) interno ao OS — BigQuery silver direto.
// Antes era proxy ao app externo — removido.
import { NextResponse } from 'next/server';
import { getRemessas } from '@/lib/producao/bq';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getRemessas();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[producao/remessas] BigQuery error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

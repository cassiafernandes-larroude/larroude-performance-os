// Cassia 2026-06-24: Produção 2.0 interno ao OS — lê BigQuery silver direto
// (silver.vpcp_op + vpcp_baixas_op_setores + vw_baixa_par_saidas, + header vpcp_remessa).
// Antes era proxy ao app externo larroude-producao-dashboard — removido.
import { NextResponse } from 'next/server';
import { getProducao } from '@/lib/producao/bq';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 min
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getProducao();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[producao] BigQuery error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

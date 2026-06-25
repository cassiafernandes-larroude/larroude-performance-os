// Cassia 2026-06-24: Produção 2.0 interno ao OS — lê BigQuery silver direto
// (silver.vpcp_op + vpcp_baixas_op_setores + vw_baixa_par_saidas, + header vpcp_remessa).
// Antes era proxy ao app externo larroude-producao-dashboard — removido.
// Cache server-side (unstable_cache, 15 min): a query BQ roda no máx. 1×/15min
// globalmente; toda visita vem instantânea do Data Cache. Fonte atualiza ~2×/dia.
import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getProducao } from '@/lib/producao/bq';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const getProducaoCached = unstable_cache(getProducao, ['producao-v3'], {
  revalidate: 900,
  tags: ['producao'],
});

export async function GET() {
  try {
    const data = await getProducaoCached();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[producao] BigQuery error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// Cassia 2026-06-24: detalhe de remessa (Produção 2.0) interno ao OS — BigQuery silver direto.
// Retorna SKUs/produtos (ref × tamanho) de uma remessa. Antes era proxy ao app externo — removido.
// Cache server-side (unstable_cache, 15 min) — chave inclui o id da remessa.
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getRemessaItems } from '@/lib/producao/bq';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const getRemessaItemsCached = unstable_cache(
  (id: string) => getRemessaItems(id),
  ['producao-remessa-itens-v1'],
  { revalidate: 900, tags: ['producao'] }
);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id || '';
  try {
    const data = await getRemessaItemsCached(id);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro', remessa: id, items: [] }, { status: 500 });
  }
}

// Cassia 2026-06-24: detalhe de remessa (Produção 2.0) interno ao OS — BigQuery silver direto.
// Retorna SKUs/produtos (ref × tamanho) de uma remessa. Antes era proxy ao app externo — removido.
import { NextRequest, NextResponse } from 'next/server';
import { getRemessaItems } from '@/lib/producao/bq';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id || '';
  try {
    const data = await getRemessaItems(id);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900, public' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro', remessa: id, items: [] }, { status: 500 });
  }
}

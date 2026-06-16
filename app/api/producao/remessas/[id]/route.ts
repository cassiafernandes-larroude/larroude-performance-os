// Cassia 2026-06-15: proxy de detalhe de remessa (Produção 2.0).
// Retorna lista de produtos/SKUs de uma remessa especifica.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 30;

const UPSTREAM_BASE = 'https://larroude-producao-dashboard.vercel.app/api/remessas';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = encodeURIComponent(params.id || '');
  try {
    const r = await fetch(`${UPSTREAM_BASE}/${id}`, { next: { revalidate: 300 } });
    if (!r.ok) return NextResponse.json({ error: `Upstream HTTP ${r.status}`, remessa: params.id, items: [] }, { status: r.status });
    const data = await r.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900, public' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro', remessa: params.id, items: [] }, { status: 500 });
  }
}

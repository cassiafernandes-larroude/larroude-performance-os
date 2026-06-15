// Cassia 2026-06-15: proxy aos dados de Produção 2.0.
// Endpoint upstream: https://larroude-producao-dashboard.vercel.app/api/producao
// Retorna KPIs + tabelas de fabricas/setores/produção diária (Senda 4).

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 min
export const maxDuration = 60;

const UPSTREAM = 'https://larroude-producao-dashboard.vercel.app/api/producao';

export async function GET() {
  try {
    const r = await fetch(UPSTREAM, { next: { revalidate: 600 } });
    if (!r.ok) return NextResponse.json({ error: `Upstream HTTP ${r.status}` }, { status: 502 });
    const data = await r.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[producao proxy] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

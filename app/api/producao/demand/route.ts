// Cassia 2026-06-15: proxy de demand model (Produção 2.0).
// Aba Demanda do dashboard original — pode retornar fallback "IAM pending" se SA nao tiver acesso.
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

const UPSTREAM = 'https://larroude-producao-dashboard.vercel.app/api/demand';

export async function GET() {
  try {
    const r = await fetch(UPSTREAM, { next: { revalidate: 600 } });
    if (!r.ok) return NextResponse.json({ error: `Upstream HTTP ${r.status}`, pending: true }, { status: r.status });
    const data = await r.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

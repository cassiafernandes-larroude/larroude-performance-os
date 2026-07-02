import { NextRequest, NextResponse } from 'next/server';
import { getCohorts } from '@/lib/clientes/queries';
import type { Market } from '@/lib/ltv-dashboard/queries';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  try {
    // Cassia 2026-07-02: coortes de aquisição 12 meses (getCohorts já devolve retenção %
    // por offset, trocas excluídas — mesma regra do LTV/Clientes). Memo 6h + CDN 1h.
    const cohorts = await memo(`cohorts:v1:${market}`, TTL_6H, () => getCohorts(market));
    return NextResponse.json({ available: true, market, cohorts }, {
      headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/cohorts]', market, msg);
    // Cassia 2026-07-02: NUNCA inventar — em falha devolve available:false (UI avisa), HTTP 200.
    return NextResponse.json({ available: false, market, error: msg, cohorts: [] });
  }
}

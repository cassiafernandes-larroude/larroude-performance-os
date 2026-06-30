// Cassia 2026-06-29: estoque por VARIANTE (tamanho) de um SKU-mãe — para o modal do carrossel.
// Mesmos 3 buckets/locations do carrossel (lib/product-performance/stock.ts): Físico/Remessa/D2D.
import { NextRequest, NextResponse } from 'next/server';
import { getVariantStock, type Market } from '@/lib/product-performance/stock';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: { market: string; mothersku: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (market !== 'US' && market !== 'BR') return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  const motherSku = decodeURIComponent(ctx.params.mothersku || '');
  if (!motherSku || !motherSku.startsWith('L')) return NextResponse.json({ error: 'Invalid mother SKU' }, { status: 400 });

  try {
    const variants = await memo(`pp-vstock:${market}:${motherSku}:v1`, TTL_30M, () => getVariantStock(market as Market, motherSku));
    return NextResponse.json(
      { market, motherSku, variants },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/product-performance/stock]', market, motherSku, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

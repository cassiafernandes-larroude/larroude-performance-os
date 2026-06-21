import { NextRequest, NextResponse } from 'next/server';
import { getCustomerJourney, type Market } from '@/lib/ltv-dashboard/queries';
import { memo, TTL_24H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(value: string): value is Market {
  return value === 'US' || value === 'BR';
}

/**
 * Customer Journey endpoint — top produtos de entrada, 2ª, 3ª compra,
 * matriz de transição 1ª→2ª, medianas de tempo entre compras.
 *
 * Lifetime (sem janela), pesado (~5-10s cold start, sub-segundo cached).
 * Filtra line items devolvidos/trocados via refunds[].refund_line_items.
 */
export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    // journey é lifetime (sem janela), TTL 24h é seguro
    const journey = await memo(`ltv:journey:v2-noexch:${market}`, TTL_24H, () => getCustomerJourney(market));
    return NextResponse.json(
      { journey, meta: { generatedAt: new Date().toISOString(), durationMs: Date.now() - startedAt } },
      {
        headers: {
          'Cache-Control':
            'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/ltv/journey]', market, msg);
    return NextResponse.json(
      { error: 'Data fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getCustomerOrders, type Market } from '@/lib/clientes/queries';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 30;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

// Pedidos de um cliente (número + origem mídia). On-demand ao expandir a linha.
export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const customerId = new URL(req.url).searchParams.get('customerId');
  if (!customerId || !/^\d{1,20}$/.test(customerId)) {
    return NextResponse.json({ error: 'customerId inválido' }, { status: 400 });
  }

  try {
    const orders = await memo(`clientes:orders:v3-leexchange:${market}:${customerId}`, TTL_6H, () =>
      getCustomerOrders(market, customerId)
    );
    return NextResponse.json({ customerId, orders }, {
      headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/clientes/orders]', market, msg);
    return NextResponse.json({ customerId, orders: [], error: msg });
  }
}

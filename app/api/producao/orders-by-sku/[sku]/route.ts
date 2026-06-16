// Cassia 2026-06-15: busca todas as orders abertas (paid + unfulfilled) por SKU mae em US+BR.
// Usado pelo modal de detalhe de Open Orders no Producao 2.0.
import { NextRequest, NextResponse } from 'next/server';
import { shopifyGraphQL, hasShopifyCredentials, type Market } from '@/lib/shopify/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 60;

type OrdersResp = {
  orders: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        createdAt: string;
        displayFulfillmentStatus: string;
        displayFinancialStatus: string;
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
        customer: { firstName?: string; lastName?: string; email?: string } | null;
        lineItems: { edges: Array<{ node: { quantity: number; sku: string; title: string; variantTitle: string | null } }> };
      };
    }>;
  };
};

interface OrderRow {
  market: 'US' | 'BR';
  order_name: string;
  created_at: string;
  days_open: number;
  status: string;
  customer: string;
  total: number;
  currency: string;
  qty_for_sku: number;
  variants: Array<{ sku: string; title: string; variantTitle: string | null; qty: number }>;
}

async function ordersForMarket(market: Market, motherSku: string): Promise<OrderRow[]> {
  if (!hasShopifyCredentials(market)) return [];
  // Tenta variantes do prefixo
  const skuQuery = `(sku:${motherSku}* OR sku:*${motherSku}*) AND fulfillment_status:unfulfilled AND financial_status:paid`;
  const query = `{
    orders(first: 100, query: "${skuQuery.replace(/"/g, '\\"')}", sortKey: CREATED_AT, reverse: false) {
      edges {
        node {
          id
          name
          createdAt
          displayFulfillmentStatus
          displayFinancialStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          customer { firstName lastName email }
          lineItems(first: 30) {
            edges { node { quantity sku title variantTitle } }
          }
        }
      }
    }
  }`;
  const data = await shopifyGraphQL<OrdersResp>(market, query);
  if (!data?.orders?.edges) return [];
  const now = Date.now();
  const motherRe = new RegExp(motherSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return data.orders.edges
    .map((e) => {
      const created = new Date(e.node.createdAt);
      const days = Math.floor((now - created.getTime()) / (24 * 3600 * 1000));
      const linhasDoSku = e.node.lineItems.edges
        .map((le) => ({
          sku: le.node.sku || '',
          title: le.node.title || '',
          variantTitle: le.node.variantTitle,
          qty: le.node.quantity || 0,
        }))
        .filter((li) => motherRe.test(li.sku));
      const qtyForSku = linhasDoSku.reduce((s, x) => s + x.qty, 0);
      if (qtyForSku === 0) return null;
      return {
        market: market.toUpperCase() as 'US' | 'BR',
        order_name: e.node.name,
        created_at: e.node.createdAt.slice(0, 10),
        days_open: days,
        status: e.node.displayFulfillmentStatus,
        customer:
          `${e.node.customer?.firstName ?? ''} ${e.node.customer?.lastName ?? ''}`.trim() ||
          e.node.customer?.email ||
          '—',
        total: Number(e.node.totalPriceSet?.shopMoney?.amount) || 0,
        currency: e.node.totalPriceSet?.shopMoney?.currencyCode || (market === 'BR' ? 'BRL' : 'USD'),
        qty_for_sku: qtyForSku,
        variants: linhasDoSku,
      } as OrderRow;
    })
    .filter((x): x is OrderRow => x !== null);
}

export async function GET(_req: NextRequest, { params }: { params: { sku: string } }) {
  const motherSku = decodeURIComponent(params.sku || '').trim();
  if (!motherSku) {
    return NextResponse.json({ error: 'missing sku' }, { status: 400 });
  }
  try {
    const [us, br] = await Promise.all([
      ordersForMarket('US' as Market, motherSku).catch(() => []),
      ordersForMarket('BR' as Market, motherSku).catch(() => []),
    ]);
    const orders = [...us, ...br].sort((a, b) => b.days_open - a.days_open);
    const totals = {
      orders: orders.length,
      pares: orders.reduce((s, o) => s + o.qty_for_sku, 0),
      pares_us: us.reduce((s, o) => s + o.qty_for_sku, 0),
      pares_br: br.reduce((s, o) => s + o.qty_for_sku, 0),
      atrasados_5d: orders.filter((o) => o.days_open >= 5).length,
      max_atraso: orders.reduce((m, o) => Math.max(m, o.days_open), 0),
    };
    return NextResponse.json(
      { sku: motherSku, totals, orders },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600, public' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro', orders: [] }, { status: 500 });
  }
}

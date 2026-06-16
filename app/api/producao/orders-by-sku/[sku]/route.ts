// Cassia 2026-06-15: busca todas as orders abertas (paid + unfulfilled) por SKU mae em US+BR.
// Estrategia robusta (rev2 — Shopify query `sku:` pega line_items.sku):
//   1) Tenta `sku:<prefix>*` (wildcard final, suportado pelo Shopify Admin)
//   2) Fallback: busca TODAS unfulfilled+paid (first:100) e filtra client-side pelo regex do SKU mae
//   3) Filtra cada line_item por regex /motherSku/i e soma quantities
import { NextRequest, NextResponse } from 'next/server';
import { shopifyGraphQL, hasShopifyCredentials, type Market } from '@/lib/shopify/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 60;

type OrderNode = {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: { firstName?: string; lastName?: string; email?: string } | null;
  lineItems: { edges: Array<{ node: { quantity: number; sku: string; title: string; variantTitle: string | null } }> };
};
type OrdersResp = { orders: { edges: Array<{ node: OrderNode }> } };

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

function nodeToRow(node: OrderNode, market: Market, motherRe: RegExp): OrderRow | null {
  const now = Date.now();
  const created = new Date(node.createdAt);
  const days = Math.floor((now - created.getTime()) / (24 * 3600 * 1000));
  const linhasDoSku = node.lineItems.edges
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
    order_name: node.name,
    created_at: node.createdAt.slice(0, 10),
    days_open: days,
    status: node.displayFulfillmentStatus,
    customer:
      `${node.customer?.firstName ?? ''} ${node.customer?.lastName ?? ''}`.trim() ||
      node.customer?.email ||
      '—',
    total: Number(node.totalPriceSet?.shopMoney?.amount) || 0,
    currency: node.totalPriceSet?.shopMoney?.currencyCode || (market === 'BR' ? 'BRL' : 'USD'),
    qty_for_sku: qtyForSku,
    variants: linhasDoSku,
  };
}

const Q_LINES = `lineItems(first: 30) { edges { node { quantity sku title variantTitle } } }`;
const Q_ORDER_FIELDS = `
  id name createdAt displayFulfillmentStatus displayFinancialStatus
  totalPriceSet { shopMoney { amount currencyCode } }
  customer { firstName lastName email }
  ${Q_LINES}
`;

async function tryQuery(market: Market, queryStr: string): Promise<OrderNode[]> {
  const q = `{
    orders(first: 100, query: "${queryStr.replace(/"/g, '\\"')}", sortKey: CREATED_AT, reverse: false) {
      edges { node { ${Q_ORDER_FIELDS} } }
    }
  }`;
  const data = await shopifyGraphQL<OrdersResp>(market, q);
  return data?.orders?.edges?.map((e) => e.node) || [];
}

async function ordersForMarket(market: Market, motherSku: string, debug = false): Promise<{ rows: OrderRow[]; meta: any }> {
  if (!hasShopifyCredentials(market)) return { rows: [], meta: { skipped: true, reason: 'no credentials' } };
  const motherRe = new RegExp(motherSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  // Tentativa 1: sku:<prefix>* (wildcard final — Shopify suporta)
  // Tentativa 2: sku:<prefix> (match exato — caso sem hifens funcione)
  // Tentativa 3 (fallback): todas unfulfilled+paid → filtra local
  const attempts = [
    `sku:${motherSku}* AND fulfillment_status:unfulfilled AND financial_status:paid`,
    `sku:${motherSku} AND fulfillment_status:unfulfilled AND financial_status:paid`,
    `fulfillment_status:unfulfilled AND financial_status:paid`,
  ];
  const log: any[] = [];

  for (let i = 0; i < attempts.length; i++) {
    const queryStr = attempts[i];
    let nodes: OrderNode[] = [];
    try {
      nodes = await tryQuery(market, queryStr);
    } catch (e: any) {
      log.push({ i, queryStr, err: e?.message });
      continue;
    }
    const rows = nodes.map((n) => nodeToRow(n, market, motherRe)).filter((x): x is OrderRow => x !== null);
    log.push({ i, queryStr, nodesReturned: nodes.length, matched: rows.length });
    if (rows.length > 0) {
      return { rows, meta: debug ? { tries: log, winnerAttempt: i } : undefined };
    }
  }
  return { rows: [], meta: debug ? { tries: log } : undefined };
}

export async function GET(req: NextRequest, { params }: { params: { sku: string } }) {
  const motherSku = decodeURIComponent(params.sku || '').trim();
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  if (!motherSku) {
    return NextResponse.json({ error: 'missing sku' }, { status: 400 });
  }
  try {
    const [us, br] = await Promise.all([
      ordersForMarket('US' as Market, motherSku, debug).catch((e) => ({ rows: [], meta: { err: e?.message } })),
      ordersForMarket('BR' as Market, motherSku, debug).catch((e) => ({ rows: [], meta: { err: e?.message } })),
    ]);
    const orders = [...us.rows, ...br.rows].sort((a, b) => b.days_open - a.days_open);
    const totals = {
      orders: orders.length,
      pares: orders.reduce((s, o) => s + o.qty_for_sku, 0),
      pares_us: us.rows.reduce((s, o) => s + o.qty_for_sku, 0),
      pares_br: br.rows.reduce((s, o) => s + o.qty_for_sku, 0),
      atrasados_5d: orders.filter((o) => o.days_open >= 5).length,
      max_atraso: orders.reduce((m, o) => Math.max(m, o.days_open), 0),
    };
    const body: any = { sku: motherSku, totals, orders };
    if (debug) body.debug = { us: us.meta, br: br.meta };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600, public' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro', orders: [] }, { status: 500 });
  }
}

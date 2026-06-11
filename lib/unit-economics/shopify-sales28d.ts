/**
 * Vendas últimos 28 dias por mother SKU.
 * Cassia 2026-06-11: "sugestões devem ser baseadas em performance de venda
 *                     nos últimos 28d"
 *
 * Usado por /api/produtos-apostar pra rankear candidatos a escalar.
 */

import type { Market } from './queries';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function getConfig(market: Market) {
  if (market === 'US') {
    return {
      domain: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com',
      token: process.env.SHOPIFY_US_ADMIN_API_TOKEN || '',
    };
  }
  return {
    domain: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com',
    token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '',
  };
}

const SALES28_QUERY = `
  query Sales28($cursor: String, $query: String!) {
    orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          cancelledAt
          test
          displayFinancialStatus
          tags
          customer { tags }
          paymentGatewayNames
          lineItems(first: 50) {
            edges {
              node {
                sku
                quantity
                discountedUnitPriceSet { shopMoney { amount } }
                originalUnitPriceSet { shopMoney { amount } }
                variant { sku }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function motherSkuOf(sku: string | null): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  if (parts.length >= 4 && /^\d+(\.\d+)?$/.test(parts[2])) {
    if (parts.length >= 5 && parts[4]) return `${parts[0]}-${parts[1]}-${parts[3]}-${parts[4]}`;
    return `${parts[0]}-${parts[1]}-${parts[3]}`;
  }
  if (parts.length >= 4 && parts[3]) return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

const EXCLUDED_TAGS = /b2b|wholesale|marketplace|redo|influencer/i;

export interface Sales28dBucket {
  units: number;
  orders: number;
  revenue: number;
  pixUnits: number;
}

export async function getSalesLast28d(
  market: Market,
  endDate: string,
  timeoutMs: number = 90_000
): Promise<{
  byMother: Map<string, Sales28dBucket>;
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  pages: number;
  partial: boolean;
  startDate: string;
  endDate: string;
}> {
  const { domain, token } = getConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);

  const end = new Date(endDate + 'T23:59:59Z');
  const start = new Date(end.getTime() - 27 * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  const startISO = start.toISOString().slice(0, 10);
  // Cassia 2026-06-11: excluir Exchange-Only do volume base. Tag 'redo' nao existe
  // na Larroude — a tag real de troca eh 'Exchange-Only'.
  const queryFilter = `created_at:>=${startISO}T00:00:00Z AND created_at:<=${endDate}T23:59:59Z AND -tag:b2b AND -tag:wholesale AND -tag:marketplace AND -tag:Exchange-Only AND -tag:influencer`;

  const t0 = Date.now();
  const byMother = new Map<string, Sales28dBucket>();
  const orderIdsByMother = new Map<string, Set<string>>();
  let totalUnits = 0;
  const totalOrdersSet = new Set<string>();
  let totalRevenue = 0;
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  let partial = false;
  const MAX_PAGES = 400;
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;

  while (hasNext && pages < MAX_PAGES) {
    if (Date.now() - t0 > timeoutMs) {
      partial = true;
      break;
    }
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: SALES28_QUERY, variables: { cursor, query: queryFilter } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify sales28d ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify sales28d errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const orders = json.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      if (o.cancelledAt || o.test) continue;
      const fs = (o.displayFinancialStatus || '').toUpperCase();
      if (fs === 'VOIDED' || fs === 'REFUNDED') continue;
      const tagsCombined = (o.tags || []).concat(o.customer?.tags || []).join(' ').toLowerCase();
      if (EXCLUDED_TAGS.test(tagsCombined)) continue;

      const isPix = market === 'BR'
        ? (o.paymentGatewayNames || []).some((p: string) => /pix/i.test(p || ''))
        : false;

      const orderId = o.id;
      totalOrdersSet.add(orderId);

      for (const li of o.lineItems.edges) {
        const sku = li.node.variant?.sku ?? li.node.sku;
        if (!sku) continue;
        const qty = Number(li.node.quantity) || 0;
        if (qty <= 0) continue;
        const mSku = motherSkuOf(sku);
        if (!mSku) continue;
        if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;

        const discPrice = parseFloat(li.node.discountedUnitPriceSet?.shopMoney?.amount || '0') || 0;
        const origPrice = parseFloat(li.node.originalUnitPriceSet?.shopMoney?.amount || '0') || 0;
        const effPrice = discPrice > 0 ? discPrice : origPrice;
        const lineRev = effPrice * qty;

        totalUnits += qty;
        totalRevenue += lineRev;

        const acc = byMother.get(mSku) || { units: 0, orders: 0, revenue: 0, pixUnits: 0 };
        acc.units += qty;
        acc.revenue += lineRev;
        if (isPix) acc.pixUnits += qty;
        byMother.set(mSku, acc);
        let mOrders = orderIdsByMother.get(mSku);
        if (!mOrders) {
          mOrders = new Set();
          orderIdsByMother.set(mSku, mOrders);
        }
        mOrders.add(orderId);
      }
    }
    hasNext = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  for (const [k, ids] of orderIdsByMother.entries()) {
    const acc = byMother.get(k);
    if (acc) acc.orders = ids.size;
  }

  console.log(
    `[ue-sales28d ${market}] ${pages} pages, orders=${totalOrdersSet.size}, units=${totalUnits}, mothers=${byMother.size}, partial=${partial}, ${Date.now() - t0}ms`
  );

  return {
    byMother,
    totalUnits,
    totalOrders: totalOrdersSet.size,
    totalRevenue,
    pages,
    partial,
    startDate: startISO,
    endDate,
  };
}

/**
 * Vendas de HOJE (D0) por mother SKU — atualizada em near real-time.
 *
 * Cassia 2026-06-11: "consegue inserir um quadro de vendas de hoje, atualizada,
 *                     do produto selecionado?"
 *
 * Query leve (só line items + quantity + SKU), com filtros DTC.
 * Cache TTL curto (5min) pra refletir vendas do dia.
 */

import type { Market } from './queries';
import { runShopifyQL } from '@/lib/main-dashboard/shopify-admin';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

/**
 * Cassia 2026-06-23: vendas OFICIAIS do Shopify de HOJE (D0) via ShopifyQL `sales` — mesma fonte/
 * definição do Triple Whale e do admin Shopify. gross_sales (pré-desconto) e total_sales (= net −
 * returns + impostos + frete). Near-real-time (não depende do pipeline BQ).
 */
export async function getTodayShopifyQLSales(market: Market): Promise<{ grossSales: number; totalSales: number; netSales: number; discounts: number; returns: number }> {
  const q = `FROM sales SHOW gross_sales, total_sales, net_sales, discounts, returns SINCE today UNTIL today`;
  const { rows, error } = await runShopifyQL(market, q, 'unstable');
  if (error) throw new Error(`ShopifyQL sales hoje: ${error}`);
  const r = rows[0] || {};
  return {
    grossSales: Math.abs(Number(r.gross_sales) || 0),
    totalSales: Number(r.total_sales) || 0,
    netSales: Number(r.net_sales) || 0,
    discounts: Math.abs(Number(r.discounts) || 0),
    returns: Math.abs(Number(r.returns) || 0),
  };
}

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

const TODAY_QUERY = `
  query Today($cursor: String, $query: String!) {
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
          totalPriceSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount } }
          lineItems(first: 50) {
            edges {
              node {
                sku
                quantity
                title
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
    if (parts.length >= 5 && parts[4]) {
      return `${parts[0]}-${parts[1]}-${parts[3]}-${parts[4]}`;
    }
    return `${parts[0]}-${parts[1]}-${parts[3]}`;
  }
  if (parts.length >= 4 && parts[3]) {
    return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
  }
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

const EXCLUDED_TAGS = /b2b|wholesale|marketplace|redo|influencer/i;

export interface TodaySalesByMother {
  units: number;
  orders: number;
  revenue: number;
}

export async function getTodaySales(
  market: Market,
  timeoutMs: number = 40_000
): Promise<{
  byMother: Map<string, TodaySalesByMother>;
  byVariant: Map<string, TodaySalesByMother>;
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  totalGrossRevenue: number;
  totalNetRevenue: number;
  pages: number;
  partial: boolean;
  generatedAt: string;
}> {
  const { domain, token } = getConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);

  // Cassia 2026-06-12: "hoje" resolvido no fuso do market (NY/Brasilia).
  // Convertemos o calendar day para janela UTC equivalente para o filtro do Shopify.
  const tz = market === 'BR' ? 'America/Sao_Paulo' : 'America/New_York';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = fmt.format(new Date()); // YYYY-MM-DD no fuso do market
  // Offset do fuso (BRT = -03, EST = -05, EDT = -04). Pegamos via formatToParts.
  const tzOffsetFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  });
  const offsetPart = tzOffsetFmt.formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-04';
  const offset = offsetPart.replace('GMT', '') || '-04'; // ex: "-04", "-05", "-03"
  const queryFilter = `created_at:>=${today}T00:00:00${offset} AND created_at:<=${today}T23:59:59${offset} AND -tag:b2b AND -tag:wholesale AND -tag:marketplace AND -tag:redo AND -tag:influencer`;

  const t0 = Date.now();
  const byMother = new Map<string, TodaySalesByMother>();
  const byVariant = new Map<string, TodaySalesByMother>();
  const orderIdsByMother = new Map<string, Set<string>>();
  const orderIdsByVariant = new Map<string, Set<string>>();
  let totalUnits = 0;
  let totalOrdersSet = new Set<string>();
  let totalRevenue = 0;
  // Cassia 2026-06-23: gross (pré-desconto) vs líquido (pós-desconto) por line item — p/ o Overview
  // separar GROSS SALES de TOTAL SALES no D0 (antes vinham iguais).
  let totalGrossRevenue = 0; // Σ originalUnitPrice × qty (pré-desconto, = total_line_items_price do BQ)
  let totalDiscounts = 0;    // Σ order.totalDiscounts (inclui cupons/desconto de pedido, não só de linha)

  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  let partial = false;
  const MAX_PAGES = 200;
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
      body: JSON.stringify({ query: TODAY_QUERY, variables: { cursor, query: queryFilter } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify today ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify today errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const orders = json.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      if (o.cancelledAt || o.test) continue;
      const fs = (o.displayFinancialStatus || '').toUpperCase();
      if (fs === 'VOIDED' || fs === 'REFUNDED') continue;
      const tagsCombined = (o.tags || []).concat(o.customer?.tags || []).join(' ').toLowerCase();
      if (EXCLUDED_TAGS.test(tagsCombined)) continue;

      const orderId = o.id;
      totalOrdersSet.add(orderId);
      totalRevenue += parseFloat(o.totalPriceSet?.shopMoney?.amount || '0') || 0;
      totalDiscounts += parseFloat(o.totalDiscountsSet?.shopMoney?.amount || '0') || 0;

      for (const li of o.lineItems.edges) {
        const qty = Number(li.node.quantity) || 0;
        if (qty <= 0) continue;
        // Revenue por line item: discounted (preço efetivo pago) × qty.
        // Se discounted vier 0/null, fallback pra original.
        const discPrice =
          parseFloat(li.node.discountedUnitPriceSet?.shopMoney?.amount || '0') || 0;
        const origPrice =
          parseFloat(li.node.originalUnitPriceSet?.shopMoney?.amount || '0') || 0;
        const effPrice = discPrice > 0 ? discPrice : origPrice;
        const lineRev = effPrice * qty;

        // Gross (pré-desconto) sobre TODAS as line items DTC (independe de SKU-mãe reconhecido).
        // O líquido é gross − descontos do pedido (calculado no return) — discountedUnitPrice só pega
        // desconto de LINHA, perde cupom/desconto de pedido.
        totalGrossRevenue += origPrice * qty;

        const sku = li.node.variant?.sku ?? li.node.sku;
        if (!sku) continue;
        const mSku = motherSkuOf(sku);
        if (!mSku) continue;
        if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;

        totalUnits += qty;

        const mAcc = byMother.get(mSku) || { units: 0, orders: 0, revenue: 0 };
        mAcc.units += qty;
        mAcc.revenue += lineRev;
        byMother.set(mSku, mAcc);
        let mOrders = orderIdsByMother.get(mSku);
        if (!mOrders) {
          mOrders = new Set();
          orderIdsByMother.set(mSku, mOrders);
        }
        mOrders.add(orderId);

        const vKey = `${mSku}|${sku}`;
        const vAcc = byVariant.get(vKey) || { units: 0, orders: 0, revenue: 0 };
        vAcc.units += qty;
        vAcc.revenue += lineRev;
        byVariant.set(vKey, vAcc);
        let vOrders = orderIdsByVariant.get(vKey);
        if (!vOrders) {
          vOrders = new Set();
          orderIdsByVariant.set(vKey, vOrders);
        }
        vOrders.add(orderId);
      }
    }

    hasNext = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  // Atualiza orders count nos buckets
  for (const [k, ids] of orderIdsByMother.entries()) {
    const acc = byMother.get(k);
    if (acc) acc.orders = ids.size;
  }
  for (const [k, ids] of orderIdsByVariant.entries()) {
    const acc = byVariant.get(k);
    if (acc) acc.orders = ids.size;
  }

  console.log(
    `[ue-today ${market}] ${pages} pages, orders=${totalOrdersSet.size}, units=${totalUnits}, mothers=${byMother.size}, partial=${partial}, ${Date.now() - t0}ms`
  );

  return {
    byMother,
    byVariant,
    totalUnits,
    totalOrders: totalOrdersSet.size,
    totalRevenue,
    totalGrossRevenue,
    totalNetRevenue: Math.max(0, totalGrossRevenue - totalDiscounts),
    pages,
    partial,
    generatedAt: new Date().toISOString(),
  };
}

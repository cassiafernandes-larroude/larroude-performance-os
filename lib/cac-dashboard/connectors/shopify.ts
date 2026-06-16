/**
 * Shopify Admin GraphQL connector — pulls orders + customers + products
 * directly from each store. No BigQuery, no Supermetrics.
 */

import type { Market } from '../queries';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

interface ShopifyConfig {
  domain: string;
  token: string;
}

function getConfig(market: Market): ShopifyConfig {
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

interface OrderEdge {
  cursor: string;
  node: {
    id: string;
    createdAt: string;
    cancelledAt: string | null;
    displayFinancialStatus: string | null;
    customer: {
      id: string;
      // ⚠️ Shopify Admin GraphQL returns numberOfOrders as a STRING
      // (e.g. "10"). Coerce to number when comparing.
      numberOfOrders: string | number;
    } | null;
    currentTotalPriceSet: {
      shopMoney: { amount: string; currencyCode: string };
    };
    lineItems: {
      edges: Array<{
        node: {
          quantity: number;
          originalUnitPriceSet: { shopMoney: { amount: string } };
          discountedUnitPriceSet: { shopMoney: { amount: string } } | null;
          variant: { sku: string | null } | null;
          product: { id: string; title: string; handle: string } | null;
        };
      }>;
    };
  };
}

interface OrdersResponse {
  data?: {
    orders: {
      edges: OrderEdge[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

const ORDERS_QUERY = `
  query GetOrders($cursor: String, $query: String!) {
    orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          createdAt
          cancelledAt
          displayFinancialStatus
          customer { id numberOfOrders }
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 50) {
            edges {
              node {
                quantity
                originalUnitPriceSet { shopMoney { amount } }
                discountedUnitPriceSet { shopMoney { amount } }
                variant { sku }
                product { id title handle }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function gql<T>(market: Market, query: string, variables: Record<string, unknown>): Promise<T> {
  const cfg = getConfig(market);
  if (!cfg.token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);

  const res = await fetch(`https://${cfg.domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': cfg.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Shopify ${market}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as T & { errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Shopify ${market} GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json;
}

export interface DailyShopify {
  date: string;
  newCustomers: number;
  newCustomerIds: Set<string>;
  orders: number;
  revenue: number;
  units: number;
}

export interface ProductDaily {
  date: string;
  motherSku: string;
  productTitle: string;
  units: number;
  revenue: number;
  newCustomers: number;
  newCustomerIds: Set<string>;
}

export interface ShopifyAggregate {
  daily: Map<string, DailyShopify>;
  productDaily: Map<string, ProductDaily>;
}

/**
 * Mother SKU heuristic — groups variants by model + color (ignoring size).
 *
 * Larroude SKU patterns observed:
 *   US: L###-MODEL-SIZE-COLOR-####     e.g. L471-DOLL-7.0-NATU-1234
 *   BR: L###-MODEL-COLOR-####          e.g. L415-STEL-PEAN-1759
 *
 * Rules:
 *   1) Skip non-product SKUs (must start with `L\d+`).
 *      → "x-redo" (Free Returns Coverage), "shipping", etc. are ignored.
 *   2) If the 3rd segment is numeric (with optional decimal), it's a size → drop it.
 *   3) Mother SKU = `<collection>-<model>-<color>`.
 */
function motherSkuOf(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  if (!/^L\d+/i.test(parts[0])) return null;

  const sizeAtIdx2 = parts[2] && /^\d+(\.\d+)?$/.test(parts[2]);
  if (sizeAtIdx2 && parts.length >= 4) {
    return [parts[0], parts[1], parts[3]].join('-');
  }
  return [parts[0], parts[1], parts[2]].join('-');
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export async function getShopifyAggregate(
  market: Market,
  startDate: string,
  endDate: string
): Promise<ShopifyAggregate> {
  const queryFilter = `created_at:>=${startDate} AND created_at:<=${endDate}T23:59:59Z`;
  const daily = new Map<string, DailyShopify>();
  const productDaily = new Map<string, ProductDaily>();

  let cursor: string | null = null;
  let hasNext = true;
  let pageCount = 0;
  // 250 orders/page × 400 pages = 100k orders max (cobre 12M com folga).
  // sortKey + reverse=true puxa primeiro os MAIS RECENTES — se atingir o cap,
  // perdemos orders antigos (menos crítico) em vez de cortar o período atual.
  const maxPages = 400;

  while (hasNext && pageCount < maxPages) {
    pageCount++;
    const json: OrdersResponse = await gql<OrdersResponse>(market, ORDERS_QUERY, { cursor, query: queryFilter });
    const orders = json.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      if (o.cancelledAt) continue;
      const date = dateOnly(o.createdAt);
      const isNew = Number(o.customer?.numberOfOrders) === 1;
      const customerId = o.customer?.id ?? '';

      let day = daily.get(date);
      if (!day) {
        day = { date, newCustomers: 0, newCustomerIds: new Set(), orders: 0, revenue: 0, units: 0 };
        daily.set(date, day);
      }
      day.orders++;
      day.revenue += parseFloat(o.currentTotalPriceSet.shopMoney.amount) || 0;
      if (isNew && customerId && !day.newCustomerIds.has(customerId)) {
        day.newCustomerIds.add(customerId);
        day.newCustomers++;
      }

      for (const li of o.lineItems.edges) {
        const node = li.node;
        const sku = node.variant?.sku ?? null;
        const mSku = motherSkuOf(sku);
        if (!mSku) continue;
        const unitPrice = parseFloat(
          (node.discountedUnitPriceSet ?? node.originalUnitPriceSet).shopMoney.amount
        ) || 0;
        const lineRevenue = unitPrice * node.quantity;
        day.units += node.quantity;

        const key = `${date}|${mSku}`;
        let pd = productDaily.get(key);
        if (!pd) {
          pd = {
            date,
            motherSku: mSku,
            productTitle: node.product?.title ?? mSku,
            units: 0,
            revenue: 0,
            newCustomers: 0,
            newCustomerIds: new Set(),
          };
          productDaily.set(key, pd);
        }
        pd.units += node.quantity;
        pd.revenue += lineRevenue;
        if (isNew && customerId && !pd.newCustomerIds.has(customerId)) {
          pd.newCustomerIds.add(customerId);
          pd.newCustomers++;
        }
      }
    }

    hasNext = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  return { daily, productDaily };
}

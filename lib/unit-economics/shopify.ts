/**
 * Unit Economics — fonte ÚNICA Shopify Admin GraphQL.
 *
 * Regra Cassia: usar Shopify direto, NÃO BigQuery.
 * Uma query traz orders + line_items + cost + tax + duties + refunds +
 * payment_gateway_names. Agrega por mother SKU e variant SKU.
 *
 * Filtros DTC: exclui B2B/wholesale/marketplace/redo/influencer (via order.tags).
 * Exclusões de lixo SKU: x-* ou puramente numérico.
 */

export type Market = 'US' | 'BR';

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

// Query única que pega TUDO necessário pra cascata de unit economics
const ORDERS_QUERY = `
  query Orders($cursor: String, $query: String!) {
    orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          createdAt
          tags
          cancelledAt
          test
          paymentGatewayNames
          customer { id tags }
          totalPriceSet { shopMoney { amount currencyCode } }
          currentTotalDutiesSet { shopMoney { amount } }
          lineItems(first: 50) {
            edges {
              node {
                id
                sku
                quantity
                title
                name
                originalUnitPriceSet { shopMoney { amount } }
                discountedUnitPriceSet { shopMoney { amount } }
                totalDiscountSet { shopMoney { amount } }
                taxLines { priceSet { shopMoney { amount } } }
                duties {
                  price { shopMoney { amount } }
                }
                variant {
                  sku
                  inventoryItem {
                    unitCost { amount }
                  }
                }
              }
            }
          }
          refunds {
            refundLineItems(first: 50) {
              edges {
                node {
                  lineItem { id }
                  quantity
                  subtotalSet { shopMoney { amount } }
                }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface OrderNode {
  id: string;
  createdAt: string;
  tags: string[];
  cancelledAt: string | null;
  test: boolean;
  paymentGatewayNames: string[];
  customer: { id: string; tags: string[] } | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  currentTotalDutiesSet: { shopMoney: { amount: string } } | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        sku: string | null;
        quantity: number;
        title: string | null;
        name: string | null;
        originalUnitPriceSet: { shopMoney: { amount: string } };
        discountedUnitPriceSet: { shopMoney: { amount: string } };
        totalDiscountSet: { shopMoney: { amount: string } };
        taxLines: Array<{ priceSet: { shopMoney: { amount: string } } }>;
        duties: Array<{ price: { shopMoney: { amount: string } } | null }>;
        variant: {
          sku: string | null;
          inventoryItem: { unitCost: { amount: string } | null } | null;
        } | null;
      };
    }>;
  };
  refunds: Array<{
    refundLineItems: {
      edges: Array<{
        node: {
          lineItem: { id: string };
          quantity: number;
          subtotalSet: { shopMoney: { amount: string } };
        };
      }>;
    };
  }>;
}

interface OrdersResponse {
  data?: {
    orders: {
      edges: Array<{ cursor: string; node: OrderNode }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

async function gql(market: Market, query: string, variables: Record<string, any>): Promise<OrdersResponse> {
  const { domain, token } = getConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as OrdersResponse;
  if (json.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json;
}

// ---------- Extrai mother SKU ----------
function motherSkuOf(sku: string | null): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  // Se parts[2] for tamanho (número), pula → mother = parts[0]-parts[1]-parts[3]
  if (parts.length >= 4 && /^\d+(\.\d+)?$/.test(parts[2])) {
    return `${parts[0]}-${parts[1]}-${parts[3]}`;
  }
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

const EXCLUDED_TAGS = /b2b|wholesale|marketplace|redo|influencer/i;

function isExcluded(order: OrderNode): boolean {
  if (order.cancelledAt) return true;
  if (order.test) return true;
  const tagsCombined = (order.tags || []).concat(order.customer?.tags || []).join(' ').toLowerCase();
  if (EXCLUDED_TAGS.test(tagsCombined)) return true;
  return false;
}

export interface ProductUnitEconomics {
  motherSku: string;
  variantSku: string | null;
  productName: string;
  totalUnits: number;
  totalOrders: number;
  unitGrossRevenue: number;
  unitDiscount: number;
  unitTax: number;
  unitDuties: number;
  unitCogs: number;
  unitRefund: number;
  pixShare: number;
  currency: 'USD' | 'BRL';
}

export interface UnitEconomicsRaw {
  market: Market;
  startDate: string;
  endDate: string;
  currency: 'USD' | 'BRL';
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  totalRefunds: number;
  cogsCoverage: number;
  products: ProductUnitEconomics[];
  variants: ProductUnitEconomics[];
}

interface BucketAcc {
  motherSku: string;
  variantSku: string | null;
  productName: string;
  totalUnits: number;
  orderIds: Set<string>;
  grossRevenue: number;
  discount: number;
  tax: number;
  duties: number;
  cogs: number;
  refund: number;
  cogsUnitsCounted: number; // units que tiveram cost real (> 0)
  pixUnits: number;
}

function makeAcc(motherSku: string, variantSku: string | null, name: string): BucketAcc {
  return {
    motherSku,
    variantSku,
    productName: name,
    totalUnits: 0,
    orderIds: new Set(),
    grossRevenue: 0,
    discount: 0,
    tax: 0,
    duties: 0,
    cogs: 0,
    refund: 0,
    cogsUnitsCounted: 0,
    pixUnits: 0,
  };
}

function finalize(acc: BucketAcc, currency: 'USD' | 'BRL', market: Market): ProductUnitEconomics | null {
  if (acc.totalUnits <= 0) return null;
  const u = acc.totalUnits;
  return {
    motherSku: acc.motherSku,
    variantSku: acc.variantSku,
    productName: acc.productName,
    totalUnits: u,
    totalOrders: acc.orderIds.size,
    unitGrossRevenue: acc.grossRevenue / u,
    unitDiscount: acc.discount / u,
    unitTax: acc.tax / u,
    unitDuties: acc.duties / u,
    unitCogs: acc.cogsUnitsCounted > 0 ? acc.cogs / acc.cogsUnitsCounted : 0,
    unitRefund: acc.refund / u,
    pixShare: market === 'US' ? 0 : u > 0 ? acc.pixUnits / u : 0,
    currency,
  };
}

/**
 * Busca orders Shopify e agrega Unit Economics por mother SKU + variant SKU.
 */
export async function getUnitEconomicsFromShopify(
  market: Market,
  startDate: string,
  endDate: string
): Promise<UnitEconomicsRaw> {
  const currency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';
  const queryFilter = `created_at:>=${startDate}T00:00:00Z AND created_at:<=${endDate}T23:59:59Z AND -tag:b2b AND -tag:wholesale AND -tag:marketplace AND -tag:redo AND -tag:influencer AND financial_status:NOT(voided OR refunded)`;

  const motherBuckets = new Map<string, BucketAcc>();
  const variantBuckets = new Map<string, BucketAcc>(); // key: mother|variant

  let cursor: string | null = null;
  let hasNext = true;
  let pageCount = 0;
  const MAX_PAGES = 400; // 100 orders/page × 400 = 40k orders max

  let totalUnits = 0;
  let totalOrders = 0;
  let totalRevenue = 0;
  let totalRefunds = 0;
  let allVariantUnits = 0;
  let cogsCoveredUnits = 0;

  while (hasNext && pageCount < MAX_PAGES) {
    pageCount++;
    const json = await gql(market, ORDERS_QUERY, { cursor, query: queryFilter });
    const orders = json.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      if (isExcluded(o)) continue;

      // PIX detection
      const isPix = (o.paymentGatewayNames || []).some((p) => /pix/i.test(p || ''));

      // Refunds: line_item_id → refunded qty + subtotal
      const refundsByLineItem = new Map<string, { qty: number; subtotal: number }>();
      for (const r of o.refunds || []) {
        for (const rli of r.refundLineItems?.edges || []) {
          const lid = rli.node.lineItem?.id;
          if (!lid) continue;
          const ex = refundsByLineItem.get(lid) || { qty: 0, subtotal: 0 };
          ex.qty += rli.node.quantity || 0;
          ex.subtotal += parseFloat(rli.node.subtotalSet?.shopMoney?.amount || '0') || 0;
          refundsByLineItem.set(lid, ex);
        }
      }

      const orderId = o.id;
      totalOrders++;
      totalRevenue += parseFloat(o.totalPriceSet.shopMoney.amount) || 0;

      for (const li of o.lineItems.edges) {
        const node = li.node;
        const variantSku = node.variant?.sku ?? node.sku;
        if (!variantSku) continue;
        const mSku = motherSkuOf(variantSku);
        if (!mSku) continue;
        // Exclui lixo
        if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;

        const qty = Number(node.quantity) || 0;
        if (qty <= 0) continue;

        const originalPrice = parseFloat(node.originalUnitPriceSet.shopMoney.amount) || 0;
        const discountedPrice = parseFloat(node.discountedUnitPriceSet.shopMoney.amount) || 0;
        const lineDiscount = parseFloat(node.totalDiscountSet.shopMoney.amount) || 0;
        const lineTax = (node.taxLines || []).reduce(
          (s, t) => s + (parseFloat(t.priceSet?.shopMoney?.amount || '0') || 0),
          0
        );
        const lineDuties = (node.duties || []).reduce(
          (s, d) => s + (parseFloat(d.price?.shopMoney?.amount || '0') || 0),
          0
        );
        const cost = parseFloat(node.variant?.inventoryItem?.unitCost?.amount || '0') || 0;
        const refund = refundsByLineItem.get(node.id);
        const refundAmount = refund?.subtotal || 0;

        const grossRevenue = originalPrice * qty;
        const totalCogs = cost * qty;

        totalUnits += qty;
        totalRefunds += refundAmount;
        allVariantUnits += qty;
        if (cost > 0) cogsCoveredUnits += qty;

        // Bucket mother
        const motherName = node.title || mSku;
        let acc = motherBuckets.get(mSku);
        if (!acc) {
          acc = makeAcc(mSku, null, motherName);
          motherBuckets.set(mSku, acc);
        }
        acc.totalUnits += qty;
        acc.orderIds.add(orderId);
        acc.grossRevenue += grossRevenue;
        acc.discount += lineDiscount;
        acc.tax += lineTax;
        acc.duties += lineDuties;
        if (cost > 0) {
          acc.cogs += totalCogs;
          acc.cogsUnitsCounted += qty;
        }
        acc.refund += refundAmount;
        if (isPix) acc.pixUnits += qty;

        // Bucket variant (drill-down)
        const vKey = `${mSku}|${variantSku}`;
        let vAcc = variantBuckets.get(vKey);
        if (!vAcc) {
          vAcc = makeAcc(mSku, variantSku, node.name || variantSku);
          variantBuckets.set(vKey, vAcc);
        }
        vAcc.totalUnits += qty;
        vAcc.orderIds.add(orderId);
        vAcc.grossRevenue += grossRevenue;
        vAcc.discount += lineDiscount;
        vAcc.tax += lineTax;
        vAcc.duties += lineDuties;
        if (cost > 0) {
          vAcc.cogs += totalCogs;
          vAcc.cogsUnitsCounted += qty;
        }
        vAcc.refund += refundAmount;
        if (isPix) vAcc.pixUnits += qty;
      }
    }

    hasNext = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  const products = Array.from(motherBuckets.values())
    .map((b) => finalize(b, currency, market))
    .filter((p): p is ProductUnitEconomics => p !== null)
    .sort((a, b) => b.totalUnits - a.totalUnits);

  const variants = Array.from(variantBuckets.values())
    .map((b) => finalize(b, currency, market))
    .filter((v): v is ProductUnitEconomics => v !== null);

  const cogsCoverage = allVariantUnits > 0 ? cogsCoveredUnits / allVariantUnits : 0;

  return {
    market,
    startDate,
    endDate,
    currency,
    totalUnits,
    totalOrders,
    totalRevenue,
    totalRefunds,
    cogsCoverage,
    products,
    variants,
  };
}

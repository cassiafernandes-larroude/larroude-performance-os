import type { Market } from "@/types/metric";
import { shopifyGraphQL, hasShopifyCredentials } from "./admin";
import { cached } from "@/lib/cache";

export type InventorySummary = {
  market: Market;
  source: "Shopify" | "Mock" | "Unavailable";
  fetched_at: string;
  // Resumo geral
  total_variants_sampled: number;
  total_units_in_stock: number;
  low_stock_count: number;
  out_of_stock_count: number;
  // Top low stock (< 20)
  low_stock_items: Array<{
    product: string;
    variant: string;
    sku: string;
    available: number;
    price: number;
  }>;
  out_of_stock_items: Array<{
    product: string;
    variant: string;
    sku: string;
  }>;
};

export type FulfillmentSummary = {
  market: Market;
  source: "Shopify" | "Mock" | "Unavailable";
  fetched_at: string;
  pending_count: number;
  late_count: number;        // > 5 dias sem fulfillment
  unfulfilled_orders: Array<{
    order_name: string;
    created_at: string;
    days_open: number;
    total: number;
    customer: string;
    items_count: number;
  }>;
};

const MOCK_INV_US: Omit<InventorySummary, "market" | "source" | "fetched_at"> = {
  total_variants_sampled: 580, total_units_in_stock: 18_400, low_stock_count: 42, out_of_stock_count: 18,
  low_stock_items: [
    { product: "Milan Mule", variant: "Black / 37", sku: "L501-Milan-BLK-37", available: 4, price: 295 },
    { product: "Stella Sandal", variant: "Nude / 36", sku: "L201-Stella-NUD-36", available: 6, price: 285 },
    { product: "Dolly Stiletto", variant: "Red / 38", sku: "L101-Dolly-RED-38", available: 8, price: 270 },
    { product: "Cyprus Boot", variant: "Brown / 39", sku: "L401-Cyprus-BRN-39", available: 12, price: 360 },
    { product: "Verona Loafer", variant: "Black / 37", sku: "L301-Verona-BLK-37", available: 15, price: 305 },
  ],
  out_of_stock_items: [
    { product: "Milan Mule", variant: "Black / 38", sku: "L501-Milan-BLK-38" },
    { product: "Stella Sandal", variant: "Nude / 37", sku: "L201-Stella-NUD-37" },
    { product: "Dolly Stiletto", variant: "Black / 36", sku: "L101-Dolly-BLK-36" },
  ],
};

const MOCK_INV_BR: Omit<InventorySummary, "market" | "source" | "fetched_at"> = {
  total_variants_sampled: 620, total_units_in_stock: 22_800, low_stock_count: 56, out_of_stock_count: 24,
  low_stock_items: [
    { product: "Dolly Stiletto", variant: "Preto / 37", sku: "L101-Dolly-PR-37", available: 3, price: 750 },
    { product: "Verona Loafer", variant: "Marrom / 38", sku: "L301-Verona-MA-38", available: 5, price: 780 },
    { product: "Milan Mule", variant: "Preto / 36", sku: "L501-Milan-PR-36", available: 7, price: 795 },
  ],
  out_of_stock_items: [
    { product: "Stella Sandal", variant: "Nude / 38", sku: "L201-Stella-NU-38" },
  ],
};

const MOCK_FF_US: Omit<FulfillmentSummary, "market" | "source" | "fetched_at"> = {
  pending_count: 84, late_count: 12,
  unfulfilled_orders: [
    { order_name: "#L1024", created_at: "2026-05-15", days_open: 7, total: 480, customer: "J. Smith", items_count: 2 },
    { order_name: "#L1031", created_at: "2026-05-16", days_open: 6, total: 295, customer: "M. Johnson", items_count: 1 },
    { order_name: "#L1045", created_at: "2026-05-17", days_open: 5, total: 620, customer: "S. Williams", items_count: 3 },
  ],
};

const MOCK_FF_BR: Omit<FulfillmentSummary, "market" | "source" | "fetched_at"> = {
  pending_count: 145, late_count: 28,
  unfulfilled_orders: [
    { order_name: "#BR2104", created_at: "2026-05-14", days_open: 8, total: 1_580, customer: "A. Silva", items_count: 2 },
    { order_name: "#BR2118", created_at: "2026-05-15", days_open: 7, total: 950, customer: "M. Santos", items_count: 1 },
  ],
};

// Cassia 2026-06-21: SEM dados-mock no fallback. Em falha/sem-credencial → ZEROS + source
// "Unavailable" (UI avisa). MOCK_* acima ficam so como referencia de shape.
const ZERO_INV: Omit<InventorySummary, "market" | "source" | "fetched_at"> = {
  total_variants_sampled: 0, total_units_in_stock: 0, low_stock_count: 0, out_of_stock_count: 0,
  low_stock_items: [], out_of_stock_items: [],
};
const ZERO_FF: Omit<FulfillmentSummary, "market" | "source" | "fetched_at"> = {
  pending_count: 0, late_count: 0, unfulfilled_orders: [],
};

// Inventario via GraphQL
type ProductsResp = {
  products: {
    edges: Array<{
      node: {
        title: string;
        variants: {
          edges: Array<{
            node: {
              title: string;
              sku: string;
              price: string;
              inventoryQuantity: number;
            };
          }>;
        };
      };
    }>;
  };
};

export async function getInventory(market: Market): Promise<InventorySummary> {
  return cached(`inventory-v2:${market}`, 1800, async () => {
    if (!hasShopifyCredentials(market)) {
      return { market, source: "Unavailable" as const, fetched_at: new Date().toISOString(), ...ZERO_INV };
    }

    // Paginar até ~5 paginas (1250 variantes) - rate limit safe
    const allVariants: Array<{ product: string; variant: string; sku: string; available: number; price: number }> = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page++) {
      const after: string = cursor ? `, after: "${cursor}"` : "";
      const query: string = `{
        products(first: 50${after}, sortKey: UPDATED_AT, reverse: true) {
          edges {
            cursor
            node {
              title
              variants(first: 25) {
                edges {
                  node {
                    title
                    sku
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage }
        }
      }`;

      const data = await shopifyGraphQL<ProductsResp & { products: { edges: Array<{ cursor: string }>; pageInfo: { hasNextPage: boolean } } }>(market, query);
      if (!data) break;

      for (const pe of data.products.edges) {
        for (const ve of pe.node.variants.edges) {
          allVariants.push({
            product: pe.node.title,
            variant: ve.node.title,
            sku: ve.node.sku ?? "",
            available: Number(ve.node.inventoryQuantity) || 0,
            price: Number(ve.node.price) || 0,
          });
        }
      }

      if (!data.products.pageInfo.hasNextPage) break;
      cursor = data.products.edges[data.products.edges.length - 1]?.cursor ?? null;
      if (!cursor) break;
    }

    const totalUnits = allVariants.reduce((s, v) => s + Math.max(0, v.available), 0);
    const lowStock = allVariants.filter((v) => v.available > 0 && v.available <= 20).sort((a, b) => a.available - b.available);
    const outOfStock = allVariants.filter((v) => v.available <= 0);

    return {
      market,
      source: "Shopify" as const,
      fetched_at: new Date().toISOString(),
      total_variants_sampled: allVariants.length,
      total_units_in_stock: totalUnits,
      low_stock_count: lowStock.length,
      out_of_stock_count: outOfStock.length,
      low_stock_items: lowStock.slice(0, 10),
      out_of_stock_items: outOfStock.slice(0, 10).map((v) => ({ product: v.product, variant: v.variant, sku: v.sku })),
    };
  });
}

// Fulfillment delay
type OrdersResp = {
  orders: {
    edges: Array<{
      node: {
        name: string;
        createdAt: string;
        displayFulfillmentStatus: string;
        totalPriceSet: { shopMoney: { amount: string } };
        customer: { firstName?: string; lastName?: string } | null;
        lineItems: { edges: Array<{ node: { quantity: number } }> };
      };
    }>;
  };
};

export async function getFulfillmentStatus(market: Market): Promise<FulfillmentSummary> {
  return cached(`fulfillment-v2:${market}`, 900, async () => {
    if (!hasShopifyCredentials(market)) {
      return { market, source: "Unavailable" as const, fetched_at: new Date().toISOString(), ...ZERO_FF };
    }

    const query = `{
      orders(first: 100, query: "fulfillment_status:unfulfilled AND financial_status:paid", sortKey: CREATED_AT, reverse: false) {
        edges {
          node {
            name
            createdAt
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount } }
            customer { firstName lastName }
            lineItems(first: 1) { edges { node { quantity } } }
          }
        }
      }
    }`;

    const data = await shopifyGraphQL<OrdersResp>(market, query);
    if (!data) {
      return { market, source: "Unavailable" as const, fetched_at: new Date().toISOString(), ...ZERO_FF };
    }

    const now = Date.now();
    const orders = data.orders.edges.map((e) => {
      const created = new Date(e.node.createdAt);
      const days = Math.floor((now - created.getTime()) / (24 * 3600 * 1000));
      const itemsRes = e.node.lineItems.edges;
      const totalItems = itemsRes.reduce((s, le) => s + (le.node.quantity ?? 0), 0);
      return {
        order_name: e.node.name,
        created_at: e.node.createdAt.slice(0, 10),
        days_open: days,
        total: Number(e.node.totalPriceSet.shopMoney.amount) || 0,
        customer: `${e.node.customer?.firstName ?? ""} ${e.node.customer?.lastName ?? ""}`.trim() || "—",
        items_count: totalItems,
      };
    });

    const lateOrders = orders.filter((o) => o.days_open >= 5).sort((a, b) => b.days_open - a.days_open);

    return {
      market,
      source: "Shopify" as const,
      fetched_at: new Date().toISOString(),
      pending_count: orders.length,
      late_count: lateOrders.length,
      unfulfilled_orders: lateOrders.slice(0, 10),
    };
  });
}

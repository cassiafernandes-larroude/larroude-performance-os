/**
 * Shopify Admin GraphQL — busca unitCost por SKU em batch.
 *
 * Usa `productVariants(query: "sku:A OR sku:B...")` com até ~100 SKUs por chunk.
 * COGS está em `variant.inventoryItem.unitCost.amount` (campo NÃO protegido por
 * policy tag — diferente da tabela BQ inventory_items.cost que está bloqueada).
 *
 * Regra Cassia: cost-per-item cadastrado nas variantes. Shopify US = USD, BR = BRL.
 */

import type { Market } from './queries';

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

const QUERY = `
  query GetVariantsCost($query: String!, $cursor: String) {
    productVariants(first: 100, after: $cursor, query: $query) {
      edges {
        cursor
        node {
          sku
          inventoryItem {
            unitCost {
              amount
              currencyCode
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface VariantsResponse {
  data?: {
    productVariants: {
      edges: Array<{
        cursor: string;
        node: {
          sku: string | null;
          inventoryItem: {
            unitCost: { amount: string; currencyCode: string } | null;
          } | null;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

async function gql(market: Market, query: string, variables: Record<string, any>): Promise<VariantsResponse> {
  const { domain, token } = getConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as VariantsResponse;
  if (json.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json;
}

/**
 * Busca unitCost por SKU em batch. Retorna Map<sku, cost>.
 * Chunks de 100 SKUs por query (limite Shopify productVariants first: 100).
 */
export async function getCogsBySku(market: Market, skus: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (skus.length === 0) return result;

  // Dedupe + filtro nulos
  const unique = Array.from(new Set(skus.filter((s) => s && s.length > 0)));
  // Chunks de 50 (queries OR ficam grandes; 50 é seguro)
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    // Constrói query: "sku:'A' OR sku:'B' OR sku:'C'..."
    // Shopify aceita aspas simples ou sem aspas; sem aspas é mais seguro
    const queryStr = chunk.map((s) => `sku:${s}`).join(' OR ');
    try {
      let cursor: string | null = null;
      let safety = 0;
      do {
        safety++;
        if (safety > 5) break; // não deveria precisar mais de 5 páginas pra 50 SKUs
        const json: VariantsResponse = await gql(market, QUERY, { query: queryStr, cursor });
        const edges = json.data?.productVariants.edges ?? [];
        for (const e of edges) {
          const sku = e.node.sku;
          const cost = e.node.inventoryItem?.unitCost?.amount;
          if (sku && cost) {
            const num = parseFloat(cost);
            if (isFinite(num) && num > 0) result.set(sku, num);
          }
        }
        cursor = json.data?.productVariants.pageInfo.hasNextPage
          ? json.data.productVariants.pageInfo.endCursor
          : null;
      } while (cursor);
    } catch (err) {
      console.error(`[ue cogs ${market}] chunk ${i}/${unique.length} failed:`, err);
      // continua nos próximos chunks
    }
  }
  return result;
}

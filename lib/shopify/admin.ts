import type { Market } from "@/types/metric";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

const STORE: Record<Market, { domain?: string; token?: string }> = {
  US: { domain: process.env.SHOPIFY_US_STORE_DOMAIN, token: process.env.SHOPIFY_US_ADMIN_API_TOKEN },
  BR: { domain: process.env.SHOPIFY_BR_STORE_DOMAIN, token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN },
};

export function hasShopifyCredentials(market: Market): boolean {
  return !!(STORE[market].domain && STORE[market].token);
}

export async function shopifyGraphQL<T>(market: Market, query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const s = STORE[market];
  if (!s.domain || !s.token) return null;
  try {
    const res = await fetch(`https://${s.domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": s.token,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`shopify ${market} HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as { data?: T; errors?: unknown };
    if (json.errors) console.warn(`shopify ${market} GraphQL errors:`, JSON.stringify(json.errors).slice(0, 300));
    return json.data ?? null;
  } catch (err) {
    console.warn(`shopify ${market} fetch falhou:`, err);
    return null;
  }
}

/**
 * Imagem + nome por mother SKU (catálogo Shopify ativo).
 *
 * Cassia 2026-06-19: cards de best-sellers com imagem do produto.
 * Uma query paginada cobre todo o catálogo → Map<motherSku, {name, image}>.
 * Cache longo (imagens mudam raramente).
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

const IMAGES_QUERY = `
  query Images($cursor: String) {
    products(first: 100, after: $cursor, query: "status:active") {
      edges {
        node {
          title
          featuredImage { url }
          variants(first: 100) { edges { node { sku } } }
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

export interface ProductImageInfo { name: string; image: string | null; }

export async function getProductImages(market: Market, timeoutMs = 45_000): Promise<Record<string, ProductImageInfo>> {
  const { domain, token } = getConfig(market);
  const out: Record<string, ProductImageInfo> = {};
  if (!token) return out;

  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const t0 = Date.now();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  const MAX_PAGES = 200;

  while (hasNext && pages < MAX_PAGES) {
    if (Date.now() - t0 > timeoutMs) break;
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: IMAGES_QUERY, variables: { cursor } }),
      cache: 'no-store',
    });
    if (!res.ok) break;
    const json = (await res.json()) as any;
    const products = json?.data?.products;
    if (!products) break;
    for (const edge of products.edges) {
      const p = edge.node;
      const image = p.featuredImage?.url ?? null;
      const name = p.title || '';
      for (const vEdge of p.variants.edges) {
        const mSku = motherSkuOf(vEdge.node.sku);
        if (!mSku) continue;
        if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;
        if (!out[mSku]) out[mSku] = { name, image };
        else if (!out[mSku].image && image) out[mSku].image = image;
      }
    }
    hasNext = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  console.log(`[product-images ${market}] ${pages} pages, ${Object.keys(out).length} mother SKUs, ${Date.now() - t0}ms`);
  return out;
}

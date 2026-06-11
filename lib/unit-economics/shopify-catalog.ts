/**
 * Catálogo Shopify completo — TODOS os produtos + variants + unitCost + price.
 *
 * Usado pra incluir produtos sem venda no D-1 no Unit Economics
 * (preço/COGS de catálogo como fallback).
 */

import type { Market, ProductUnitEconomics } from './queries';

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

const CATALOG_QUERY = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor, query: "status:active") {
      edges {
        cursor
        node {
          id
          title
          status
          variants(first: 100) {
            edges {
              node {
                sku
                price
                compareAtPrice
                inventoryItem { unitCost { amount } }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface CatalogResp {
  data?: {
    products: {
      edges: Array<{
        cursor: string;
        node: {
          id: string;
          title: string;
          status: string;
          variants: {
            edges: Array<{
              node: {
                sku: string | null;
                price: string;
                compareAtPrice: string | null;
                inventoryItem: { unitCost: { amount: string } | null } | null;
              };
            }>;
          };
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

function motherSkuOf(sku: string | null): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  if (parts.length >= 4 && /^\d+(\.\d+)?$/.test(parts[2])) {
    return `${parts[0]}-${parts[1]}-${parts[3]}`;
  }
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

interface CatalogAcc {
  motherSku: string;
  productName: string;
  totalPrice: number;
  totalCompareAt: number;
  compareAtVariantCount: number;
  totalCost: number;
  variantCount: number;
  costVariantCount: number;
  variants: Map<string, { price: number; compareAtPrice: number; cost: number; productName: string }>;
}

export interface CatalogEntry {
  motherSku: string;
  variantSku: string | null;
  productName: string;
  /** variant.price (preço efetivo cobrado — pode estar com desconto site) */
  unitPrice: number;
  /** variant.compareAtPrice (preço cheio "de" - quando há desconto site). 0 se não há. */
  unitCompareAtPrice: number;
  /** Preço "list" pra display: compareAtPrice se > 0, senão price. Pra cascata partir do cheio. */
  unitListPrice: number;
  unitCogs: number;
}

export async function getShopifyCatalog(
  market: Market,
  timeoutMs: number = 60_000
): Promise<{ products: CatalogEntry[]; variants: CatalogEntry[]; pages: number; partial: boolean }> {
  const { domain, token } = getConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);

  const t0 = Date.now();
  const motherBuckets = new Map<string, CatalogAcc>();
  const variantsOut: CatalogEntry[] = [];

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
      body: JSON.stringify({ query: CATALOG_QUERY, variables: { cursor } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify catalog ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as CatalogResp;
    if (json.errors?.length) throw new Error(`Shopify catalog errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const products = json.data?.products;
    if (!products) break;

    for (const pEdge of products.edges) {
      const p = pEdge.node;
      if (p.status !== 'ACTIVE') continue;
      for (const vEdge of p.variants.edges) {
        const v = vEdge.node;
        const variantSku = v.sku;
        if (!variantSku) continue;
        const mSku = motherSkuOf(variantSku);
        if (!mSku) continue;
        if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;

        const price = parseFloat(v.price || '0') || 0;
        const compareAtPrice = parseFloat(v.compareAtPrice || '0') || 0;
        const cost = parseFloat(v.inventoryItem?.unitCost?.amount || '0') || 0;
        // listPrice = preço CHEIO ("de"). Quando há desconto site (BR), compareAtPrice
        // tem o preço cheio e price tem o efetivo. Fallback pra price quando sem desconto.
        const listPrice = compareAtPrice > 0 ? compareAtPrice : price;

        let acc = motherBuckets.get(mSku);
        if (!acc) {
          acc = {
            motherSku: mSku,
            productName: p.title || mSku,
            totalPrice: 0,
            totalCompareAt: 0,
            compareAtVariantCount: 0,
            totalCost: 0,
            variantCount: 0,
            costVariantCount: 0,
            variants: new Map(),
          };
          motherBuckets.set(mSku, acc);
        }
        acc.totalPrice += price;
        acc.variantCount += 1;
        if (compareAtPrice > 0) {
          acc.totalCompareAt += compareAtPrice;
          acc.compareAtVariantCount += 1;
        }
        if (cost > 0) {
          acc.totalCost += cost;
          acc.costVariantCount += 1;
        }
        acc.variants.set(variantSku, {
          price,
          compareAtPrice,
          cost,
          productName: p.title || variantSku,
        });
        variantsOut.push({
          motherSku: mSku,
          variantSku,
          productName: p.title || variantSku,
          unitPrice: price,
          unitCompareAtPrice: compareAtPrice,
          unitListPrice: listPrice,
          unitCogs: cost,
        });
      }
    }

    hasNext = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  const productsOut: CatalogEntry[] = Array.from(motherBuckets.values()).map((acc) => {
    const avgPrice = acc.variantCount > 0 ? acc.totalPrice / acc.variantCount : 0;
    const avgCompareAt =
      acc.compareAtVariantCount > 0 ? acc.totalCompareAt / acc.compareAtVariantCount : 0;
    const listPrice = avgCompareAt > 0 ? avgCompareAt : avgPrice;
    return {
      motherSku: acc.motherSku,
      variantSku: null,
      productName: acc.productName,
      unitPrice: avgPrice,
      unitCompareAtPrice: avgCompareAt,
      unitListPrice: listPrice,
      unitCogs: acc.costVariantCount > 0 ? acc.totalCost / acc.costVariantCount : 0,
    };
  });

  console.log(`[ue-catalog ${market}] ${pages} pages, ${productsOut.length} products, ${variantsOut.length} variants, partial=${partial}, ${Date.now() - t0}ms`);

  return { products: productsOut, variants: variantsOut, pages, partial };
}

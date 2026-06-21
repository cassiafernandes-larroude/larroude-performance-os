/**
 * Metadados por mother SKU (catálogo Shopify ativo): imagem, nome e CLASSIFICAÇÃO
 * pra abas do carrossel de mais vendidos.
 *
 * Cassia 2026-06-19: cards de best-sellers com imagem + abas
 * (lançamentos / collabs / b2b / tênis / bolsas-acessórios / vestuário / material-cor).
 * Fonte: productType + tags + createdAt do produto (line_items.product_type vem vazio).
 * Uma query paginada cobre o catálogo. Cache longo.
 */

import type { Market } from './queries';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';
const NEW_DAYS = 180; // "lançamentos" = criado nos últimos N dias

function getConfig(market: Market) {
  if (market === 'US') {
    return { domain: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com', token: process.env.SHOPIFY_US_ADMIN_API_TOKEN || '' };
  }
  return { domain: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com', token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '' };
}

const META_QUERY = `
  query Meta($cursor: String) {
    products(first: 100, after: $cursor, query: "status:active") {
      edges {
        node {
          title
          productType
          tags
          createdAt
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

export type ProductGroup = 'tenis' | 'bolsas' | 'vestuario' | 'calcados' | 'outros';

function groupOf(productType: string): ProductGroup {
  const t = productType.toLowerCase();
  if (t.includes('sneaker') || t.includes('tênis') || t.includes('tenis')) return 'tenis';
  if (t.includes('bag') || t.includes('handbag') || t.includes('accessor') || t.includes('belt') || t.includes('clutch') || t.includes('pouch')) return 'bolsas';
  if (t.includes('cloth') || t.includes('apparel') || t.includes('dress') || t.includes('top') || t.includes('skirt') || t.includes('pant')) return 'vestuario';
  if (t.includes('gift')) return 'outros';
  if (!t) return 'outros';
  return 'calcados'; // boot, sandal, mule, flat, pump, wedge, heel, etc.
}

// Materiais conhecidos da Larroudé — o título quase sempre traz ("...In Black Suede",
// "Loulou Mule Beige Raffia"), enquanto a tag "Shop By Material" só cobre ~10% do catálogo.
const MATERIAL_KEYWORDS = ['Raffia', 'Leather', 'Suede', 'Velvet', 'Vinyl', 'Metallic', 'Specchio', 'Patent', 'Denim', 'Fabric', 'Cork', 'Satin', 'Mesh', 'Croc', 'Crystal', 'Knit', 'Canvas', 'Rubber', 'Wool', 'Jelly'];
function materialsFromTitle(title: string): string[] {
  const t = (title || '').toLowerCase();
  return MATERIAL_KEYWORDS.filter((m) => t.includes(m.toLowerCase()));
}

export interface ProductMeta {
  name: string;
  image: string | null;
  group: ProductGroup;
  isB2B: boolean;
  isCollab: boolean;
  isNew: boolean;
  materials: string[];
  colors: string[];
}

export async function getProductImages(market: Market, timeoutMs = 45_000): Promise<Record<string, ProductMeta>> {
  const { domain, token } = getConfig(market);
  const out: Record<string, ProductMeta> = {};
  if (!token) return out;

  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const cutoff = new Date(Date.now() - NEW_DAYS * 86400000).toISOString();
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
      body: JSON.stringify({ query: META_QUERY, variables: { cursor } }),
      cache: 'no-store',
    });
    if (!res.ok) break;
    const json = (await res.json()) as any;
    const products = json?.data?.products;
    if (!products) break;
    for (const edge of products.edges) {
      const p = edge.node;
      const tags: string[] = Array.isArray(p.tags) ? p.tags : [];
      const meta: ProductMeta = {
        name: p.title || '',
        image: p.featuredImage?.url ?? null,
        group: groupOf(p.productType || ''),
        isB2B: tags.includes('Catalog_B2B'),
        isCollab: tags.some((t) => /collab/i.test(t)),
        isNew: typeof p.createdAt === 'string' && p.createdAt >= cutoff,
        materials: Array.from(new Set([
          ...tags.filter((t) => t.startsWith('Shop By Material - ')).map((t) => t.replace('Shop By Material - ', '').trim()),
          ...materialsFromTitle(p.title || ''),
        ])),
        colors: tags.filter((t) => t.startsWith('Collection-')).map((t) => t.replace('Collection-', '').replace(/-/g, ' ').trim()),
      };
      for (const vEdge of p.variants.edges) {
        const mSku = motherSkuOf(vEdge.node.sku);
        if (!mSku) continue;
        if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;
        if (!out[mSku]) out[mSku] = meta;
        else if (!out[mSku].image && meta.image) out[mSku].image = meta.image;
      }
    }
    hasNext = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  console.log(`[product-meta ${market}] ${pages} pages, ${Object.keys(out).length} mother SKUs, ${Date.now() - t0}ms`);
  return out;
}

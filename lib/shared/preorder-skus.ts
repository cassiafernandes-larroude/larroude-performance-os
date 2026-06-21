/**
 * Mother SKUs dos produtos PRE-ORDER (pré-lançamento) — da coleção de pré-venda do Shopify.
 *
 * Cassia 2026-06-20: a empresa tem 3 origens — In Stock, On-Demand (produzido por
 * esgotar estoque: on-demand + from-batch) e Pre-Order (pré-lançamento). Pre-order é
 * atributo de PRODUTO (não de fulfillment), identificado pela coleção de pré-venda:
 *   US: 310897770662 "Pre-Order | Made for You, Not for Waste"
 *   BR: 493998506298 "Pré-venda | Feito para você, não para descarte"
 * Retornamos os mother SKUs (estilo+cor) pra casar com os line items dos pedidos no BQ.
 */

import type { Market } from '@/lib/unit-economics/queries';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';
const PREORDER_COLLECTION_ID: Record<Market, string> = {
  US: '310897770662',
  BR: '493998506298',
};

function getConfig(market: Market) {
  if (market === 'US') return { domain: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com', token: process.env.SHOPIFY_US_ADMIN_API_TOKEN || '' };
  return { domain: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com', token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '' };
}

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

// Cache em memória (process) — coleção muda devagar. TTL 6h.
const cache = new Map<Market, { skus: string[]; at: number }>();
const TTL = 6 * 60 * 60 * 1000;

/**
 * Versão SÍNCRONA: retorna o que está em cache (ou [] se ainda não carregado).
 * Usada dentro do builder de SQL (sync). As rotas devem chamar getPreorderMotherSkus(market)
 * antes (await) pra esquentar o cache. Dispara um warm em background se vazio.
 */
export function getPreorderMotherSkusCached(market: Market): string[] {
  const cached = cache.get(market);
  if (cached) return cached.skus;
  void getPreorderMotherSkus(market).catch(() => {}); // warm best-effort
  return [];
}

export async function getPreorderMotherSkus(market: Market): Promise<string[]> {
  const cached = cache.get(market);
  if (cached && Date.now() - cached.at < TTL) return cached.skus;

  const { domain, token } = getConfig(market);
  if (!token) return cached?.skus ?? [];
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const gid = `gid://shopify/Collection/${PREORDER_COLLECTION_ID[market]}`;
  const out = new Set<string>();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  try {
    while (hasNext && pages < 20) {
      pages++;
      const query = `query Pre($cursor: String) { collection(id: "${gid}") { products(first: 250, after: $cursor) { edges { node { variants(first: 1) { edges { node { sku } } } } } pageInfo { hasNextPage endCursor } } } }`;
      const res: Response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables: { cursor } }),
        cache: 'no-store',
      });
      if (!res.ok) break;
      const json: any = await res.json();
      const products = json?.data?.collection?.products;
      if (!products) break;
      for (const edge of products.edges) {
        const m = motherSkuOf(edge.node.variants?.edges?.[0]?.node?.sku ?? null);
        if (m && !/^x-/i.test(m) && !/^[0-9]+$/.test(m)) out.add(m);
      }
      hasNext = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
    }
  } catch (err) {
    console.warn('[preorder-skus] falhou', market, (err as Error)?.message);
    return cached?.skus ?? [];
  }
  const skus = Array.from(out);
  if (skus.length > 0) cache.set(market, { skus, at: Date.now() });
  console.log(`[preorder-skus ${market}] ${skus.length} mother SKUs (${pages} páginas)`);
  return skus;
}

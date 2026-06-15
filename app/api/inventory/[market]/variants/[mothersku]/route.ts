// Cassia 2026-06-15: variantes (tamanho) por mother SKU para o modal drill-down do Inventory.
// Endpoint: /api/inventory/{US|BR}/variants/{mother_sku}
//
// Usa Shopify Admin GraphQL API direta (a SA do BigQuery do lpos não tem acesso a
// larroude-data-platform.shopify_{us,br}, então BQ direto não rola).
//
// Locations conforme regras documentadas em DOCUMENTACAO-COMPLETA-dashboards-larroude.md §8.7:
//   BR Sale = LARROUDE RS (104995258682)
//   BR On-Demand = Possibility Factory (113962942778)
//   BR From-Batch = Senda Factory (113962910010)
//   US Sale = LARROUDE RS + REDO + Ship Essential NY (75024760998, 81547165862, 82259476646)
//   US On-Demand = Possibility Factory (82824921254)
//   US From-Batch = Senda Factory (82824822950)

import { NextRequest, NextResponse } from 'next/server';
import { shopifyGraphQL, hasShopifyCredentials } from '@/lib/shopify/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 30;

const LOCATIONS: Record<'US' | 'BR', { instock: string[]; ondemand: string; frombatch: string }> = {
  US: {
    instock: ['75024760998', '81547165862', '82259476646'],
    ondemand: '82824921254',
    frombatch: '82824822950',
  },
  BR: {
    instock: ['104995258682'],
    ondemand: '113962942778',
    frombatch: '113962910010',
  },
};

// Mother SKU `L471-VERO-NATU-1967` → variantes têm formato `L471-VERO-{size}-NATU-1967`.
// O regex que o dashboard original usa: `REGEXP_REPLACE(sku, r'^(L\d+-[A-Z]+)-[\d.]+-', r'\1-')`
// Ou seja, pra montar a busca, separamos: prefixo `L471-VERO` + sufixo `-NATU-1967`.
function buildSearchQuery(motherSku: string): string {
  const parts = motherSku.split('-');
  if (parts.length < 4) {
    // Fallback genérico: busca por SKU contendo o mother
    return `sku:*${motherSku}*`;
  }
  const prefix = `${parts[0]}-${parts[1]}`;       // L471-VERO
  const suffix = parts.slice(2).join('-');         // NATU-1967
  // Shopify search aceita wildcards no meio: `L471-VERO-*-NATU-1967`
  return `sku:${prefix}-*-${suffix}`;
}

interface ShopifyVariantsResp {
  productVariants: {
    edges: Array<{
      node: {
        sku: string;
        title: string;
        inventoryItem: {
          inventoryLevels: {
            edges: Array<{
              node: {
                location: { id: string };
                quantities: Array<{ name: string; quantity: number }>;
              };
            }>;
          };
        };
      };
    }>;
  };
}

function extractSize(sku: string): string | null {
  // L471-VERO-5.0-NATU-1967  →  5.0
  const m = sku.match(/^L\d+-[A-Z]+-([\d.]+)-/);
  return m ? m[1] : null;
}

export async function GET(_req: NextRequest, { params }: { params: { market: string; mothersku: string } }) {
  const market = (params.market || '').toUpperCase() as 'US' | 'BR';
  const motherSku = decodeURIComponent(params.mothersku || '');

  if (!['US', 'BR'].includes(market)) {
    return NextResponse.json({ error: 'Invalid market. Use US or BR.' }, { status: 400 });
  }
  if (!motherSku || !motherSku.startsWith('L')) {
    return NextResponse.json({ error: 'Invalid mother SKU.' }, { status: 400 });
  }

  if (!hasShopifyCredentials(market)) {
    return NextResponse.json({
      error: `Shopify credentials ausentes para ${market}. Configure SHOPIFY_${market}_STORE_DOMAIN e SHOPIFY_${market}_ADMIN_API_TOKEN no Vercel.`,
    }, { status: 500 });
  }

  try {
    const searchQuery = buildSearchQuery(motherSku);

    const data = await shopifyGraphQL<ShopifyVariantsResp>(market, `
      query VariantsByMotherSku($q: String!) {
        productVariants(first: 50, query: $q) {
          edges {
            node {
              sku
              title
              inventoryItem {
                inventoryLevels(first: 20) {
                  edges {
                    node {
                      location { id }
                      quantities(names: ["available"]) { name quantity }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, { q: searchQuery });

    if (!data || !data.productVariants) {
      return NextResponse.json({
        market, motherSku, generatedAt: new Date().toISOString(), variants: [],
      });
    }

    const locs = LOCATIONS[market];
    const variants = data.productVariants.edges.map(({ node }) => {
      let inStock = 0, onDemand = 0, fromBatch = 0;
      for (const { node: lvl } of node.inventoryItem?.inventoryLevels?.edges || []) {
        const gid = lvl.location.id; // "gid://shopify/Location/82824921254"
        const locId = gid.split('/').pop() || '';
        const available = lvl.quantities?.find(q => q.name === 'available')?.quantity ?? 0;
        if (locs.instock.includes(locId)) inStock += available;
        else if (locId === locs.ondemand) onDemand += available;
        else if (locId === locs.frombatch) fromBatch += available;
      }
      return {
        sku: node.sku,
        size: extractSize(node.sku) || node.title,
        inStock, onDemand, fromBatch,
        total: inStock + onDemand + fromBatch,
      };
    });

    // Ordena por tamanho numérico
    variants.sort((a, b) => {
      const sa = parseFloat(a.size || '0');
      const sb = parseFloat(b.size || '0');
      if (isNaN(sa) || isNaN(sb)) return (a.size || '').localeCompare(b.size || '');
      return sa - sb;
    });

    return NextResponse.json({
      market, motherSku, generatedAt: new Date().toISOString(), variants,
    }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900, public' },
    });
  } catch (e: any) {
    console.error('[inventory variants] error:', e);
    return NextResponse.json({
      error: e?.message || 'Internal error',
      detail: e?.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
}

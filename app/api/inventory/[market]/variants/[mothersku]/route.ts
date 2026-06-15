// Cassia 2026-06-15: variantes (tamanho) por mother SKU para o modal drill-down.
// Endpoint: /api/inventory/{US|BR}/variants/{mother_sku}
//
// Locations (DOCUMENTACAO-COMPLETA-dashboards-larroude.md §8.7):
//   BR Sale = LARROUDE RS (104995258682)
//   BR On-Demand = Possibility Factory (113962942778)
//   BR From-Batch = Senda Factory (113962910010)
//   US Sale = LARROUDE RS + REDO + Ship Essential NY
//   US On-Demand = Possibility Factory (82824921254)
//   US From-Batch = Senda Factory (82824822950)

import { NextRequest, NextResponse } from 'next/server';
import { shopifyGraphQL, hasShopifyCredentials } from '@/lib/shopify/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 30;

const LOCATIONS: Record<'US' | 'BR', { instock: string[]; ondemand: string; frombatch: string }> = {
  US: { instock: ['75024760998', '81547165862', '82259476646'], ondemand: '82824921254', frombatch: '82824822950' },
  BR: { instock: ['104995258682'], ondemand: '113962942778', frombatch: '113962910010' },
};

function skuToMother(sku: string): string {
  // L471-DOLL-7.5-NATU-1967  →  L471-DOLL-NATU-1967
  return sku.replace(/^(L\d+-[A-Z]+)-[\d.]+-/, '$1-');
}
function extractSize(sku: string): string | null {
  const m = sku.match(/^L\d+-[A-Z]+-([\d.]+)-/);
  return m ? m[1] : null;
}

interface VariantNode {
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
}
type Resp = { productVariants: { edges: Array<{ node: VariantNode }> } };

const QUERY = `
  query VariantsByMotherSku($q: String!) {
    productVariants(first: 100, query: $q) {
      edges {
        node {
          sku
          title
          inventoryItem {
            inventoryLevels(first: 20) {
              edges {
                node {
                  location { id }
                  quantities(names: ["available", "on_hand"]) { name quantity }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function GET(_req: NextRequest, { params }: { params: { market: string; mothersku: string } }) {
  const market = (params.market || '').toUpperCase() as 'US' | 'BR';
  const motherSku = decodeURIComponent(params.mothersku || '');

  if (!['US', 'BR'].includes(market)) {
    return NextResponse.json({ error: 'Invalid market.' }, { status: 400 });
  }
  if (!motherSku || !motherSku.startsWith('L')) {
    return NextResponse.json({ error: 'Invalid mother SKU.' }, { status: 400 });
  }
  if (!hasShopifyCredentials(market)) {
    return NextResponse.json({ error: `Shopify credentials ausentes para ${market}.` }, { status: 500 });
  }

  try {
    const parts = motherSku.split('-');
    const prefix = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : motherSku;

    // Múltiplas tentativas até achar variantes. Shopify Admin GraphQL aceita wildcard prefix/suffix.
    const queries = [
      `sku:${prefix}-*`,         // L471-DOLL-* (prefix com wildcard)
      `sku:${prefix}*`,          // L471-DOLL* (fallback sem dash)
      `sku:*${motherSku}*`,      // contém o mother (caso SKU completo seja o mother)
      `sku:${motherSku}`,        // exato
    ];

    const locs = LOCATIONS[market];
    let allRaw: VariantNode[] = [];
    const tried: Array<{ q: string; count: number; matched: number }> = [];

    for (const q of queries) {
      const data = await shopifyGraphQL<Resp>(market, QUERY, { q });
      const nodes = data?.productVariants?.edges?.map(e => e.node) ?? [];
      const matched = nodes.filter(n => n.sku && skuToMother(n.sku) === motherSku);
      tried.push({ q, count: nodes.length, matched: matched.length });
      if (matched.length > 0) {
        allRaw = matched;
        break;
      }
    }

    // Última tentativa: busca mais ampla pelo número final + filtro client-side
    if (allRaw.length === 0 && parts.length >= 4) {
      const last = parts[parts.length - 1]; // 1967
      const q = `sku:*${last}`;
      const data = await shopifyGraphQL<Resp>(market, QUERY, { q });
      const nodes = data?.productVariants?.edges?.map(e => e.node) ?? [];
      const matched = nodes.filter(n => n.sku && skuToMother(n.sku) === motherSku);
      tried.push({ q, count: nodes.length, matched: matched.length });
      if (matched.length > 0) allRaw = matched;
    }

    const variants = allRaw.map(node => {
      let inStock = 0, onDemand = 0, fromBatch = 0;
      for (const { node: lvl } of node.inventoryItem?.inventoryLevels?.edges || []) {
        const gid = lvl.location?.id || '';
        const locId = gid.split('/').pop() || '';
        const available = lvl.quantities?.find(q => q.name === 'available')?.quantity
          ?? lvl.quantities?.find(q => q.name === 'on_hand')?.quantity
          ?? 0;
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

    variants.sort((a, b) => {
      const sa = parseFloat(a.size || '0');
      const sb = parseFloat(b.size || '0');
      if (isNaN(sa) || isNaN(sb)) return (a.size || '').localeCompare(b.size || '');
      return sa - sb;
    });

    return NextResponse.json({
      market, motherSku, generatedAt: new Date().toISOString(),
      variants,
      ...(variants.length === 0 ? { debug: { tried, hint: 'Nenhuma variante bateu com o mother SKU.' } } : {}),
    }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900, public' },
    });
  } catch (e: any) {
    console.error('[inventory variants] error:', e);
    return NextResponse.json({
      error: e?.message || 'Internal error',
      detail: e?.stack?.split('\n').slice(0, 5).join(' | '),
    }, { status: 500 });
  }
}

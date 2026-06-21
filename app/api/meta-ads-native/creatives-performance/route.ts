// Cassia 2026-06-14: cruza criativos Meta com vendas reais no Shopify + imagens dos produtos/coleções.
// POST { market, since, until, skus[], collections[] }
// Response: { skus: {[sku]: SkuPerf}, collections: {[id]: CollectionPerf} }
//
// SKUs: regex L\d{3,5} no nome do ad → busca line_items.sku via BQ + imagem via Shopify Admin GraphQL.
// Collections: 12+ dígitos no nome do ad → busca collection no Shopify + soma vendas dos produtos.
//
// Cruza apenas DTC — usa os mesmos filtros do Main Dashboard (exclui B2B, PIX não-pago, threshold).

import { NextRequest, NextResponse } from 'next/server';
import { hasBigQueryCredentials } from '@/lib/bigquery/client';
import { shopifyGraphQL, hasShopifyCredentials } from '@/lib/shopify/admin';
import { EXCLUDED_TAGS_REGEX } from '@/lib/shared/dtc-filters';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

interface RequestBody {
  market: 'US' | 'BR';
  since: string;
  until: string;
  skus: string[];
  collections?: string[];
}

interface SkuPerformance {
  units: number;
  revenue: number;
  productName: string | null;
  productImage: string | null;
  currency: 'USD' | 'BRL';
}

interface CollectionPerformance {
  title: string | null;
  image: string | null;
  productCount: number;
  units: number;
  revenue: number;
  currency: 'USD' | 'BRL';
}

const MAX_ORDER_VALUE = { US: 30000, BR: 25000 } as const;
const TZ = { US: 'America/New_York', BR: 'America/Sao_Paulo' } as const;
// Cassia 2026-06-21: regex DTC canonica (inclui `influencer`) para convergir com Main/Overview/Shopify.
const EXCLUDED_TAGS = EXCLUDED_TAGS_REGEX;

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { market, since, until, skus, collections = [] } = body;

    if (!market || !since || !until) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    if (!hasBigQueryCredentials()) {
      return NextResponse.json({ error: 'BigQuery not configured' }, { status: 503 });
    }

    const currency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';
    const { runQuery } = await import('@/lib/bigquery/client');
    const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';

    // Filtros DTC alinhados com Main/CAC
    const pixFilter = market === 'BR'
      ? `AND o.financial_status NOT IN ('voided','refunded','pending','expired','authorized')`
      : `AND o.financial_status NOT IN ('voided','refunded')`;

    // 1) SKUs: agrupa line_items por mother code (L0042) e soma units/revenue
    const skusResult: Record<string, SkuPerformance> = {};
    if (skus.length > 0) {
      const skuPattern = skus.map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean).join('|');
      if (skuPattern) {
        const sql = `
          WITH line_items_unnested AS (
            SELECT
              UPPER(JSON_VALUE(li, '$.sku')) AS sku_raw,
              JSON_VALUE(li, '$.title') AS title,
              CAST(JSON_VALUE(li, '$.quantity') AS FLOAT64) AS qty,
              CAST(JSON_VALUE(li, '$.price') AS FLOAT64) AS unit_price
            FROM \`larroude-data-prod.${dataset}.orders\` o,
              UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
            WHERE DATE(o.created_at, '${TZ[market]}') BETWEEN @since AND @until
              AND o.cancelled_at IS NULL
              AND o.test = FALSE
              ${pixFilter}
              AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'${EXCLUDED_TAGS}')
              AND (JSON_VALUE(o.customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'${EXCLUDED_TAGS}'))
              AND CAST(o.total_price AS NUMERIC) < ${MAX_ORDER_VALUE[market]}
          ),
          matched AS (
            SELECT
              REGEXP_EXTRACT(sku_raw, r'(L\\d{3,5})') AS mother_code,
              title, qty, unit_price
            FROM line_items_unnested
            WHERE sku_raw IS NOT NULL AND REGEXP_CONTAINS(sku_raw, r'(${skuPattern})')
          )
          SELECT
            mother_code AS sku,
            ANY_VALUE(title) AS product_name,
            SUM(qty) AS units,
            SUM(qty * unit_price) AS revenue
          FROM matched
          WHERE mother_code IS NOT NULL
          GROUP BY mother_code
        `;
        const rows = await runQuery<{ sku: string; product_name: string | null; units: number | string; revenue: number | string }>(sql, { since, until });
        for (const r of rows) {
          skusResult[r.sku] = { units: Number(r.units) || 0, revenue: Number(r.revenue) || 0, productName: r.product_name ?? null, productImage: null, currency };
        }
      }

      // Buscar imagens dos SKUs via Shopify Admin GraphQL (em paralelo, em batches pequenos)
      if (hasShopifyCredentials(market)) {
        await Promise.all(skus.map(async sku => {
          try {
            const query = `query($sku: String!) { productVariants(first: 1, query: $sku) { edges { node { product { title featuredImage { url } } } } } }`;
            const data = await shopifyGraphQL<{ productVariants: { edges: { node: { product: { title: string; featuredImage?: { url: string } | null } } }[] } }>(market, query, { sku: `sku:${sku}*` });
            const edge = data?.productVariants?.edges?.[0];
            if (edge) {
              if (!skusResult[sku]) skusResult[sku] = { units: 0, revenue: 0, productName: null, productImage: null, currency };
              skusResult[sku].productName = skusResult[sku].productName ?? edge.node.product.title;
              skusResult[sku].productImage = edge.node.product.featuredImage?.url ?? null;
            }
          } catch {/* ignore individual sku errors */}
        }));
      }

      // Preencher SKUs sem hits
      for (const sku of skus) {
        if (!skusResult[sku]) skusResult[sku] = { units: 0, revenue: 0, productName: null, productImage: null, currency };
      }
    }

    // 2) Collections: buscar metadados + produtos, depois somar vendas via BQ
    const collectionsResult: Record<string, CollectionPerformance> = {};
    if (collections.length > 0 && hasShopifyCredentials(market)) {
      await Promise.all(collections.map(async colId => {
        try {
          const query = `query($id: ID!) {
            collection(id: $id) {
              title
              image { url }
              productsCount { count }
              products(first: 50) {
                edges { node { id title variants(first: 5) { edges { node { sku } } } } }
              }
            }
          }`;
          const data = await shopifyGraphQL<{
            collection: {
              title: string;
              image?: { url: string } | null;
              productsCount?: { count: number };
              products: { edges: { node: { variants: { edges: { node: { sku: string | null } }[] } } }[] };
            } | null;
          }>(market, query, { id: `gid://shopify/Collection/${colId}` });

          if (!data?.collection) {
            collectionsResult[colId] = { title: null, image: null, productCount: 0, units: 0, revenue: 0, currency };
            return;
          }
          const col = data.collection;
          // Coletar todos SKUs dos produtos da coleção
          const allSkus = new Set<string>();
          for (const pe of col.products.edges) {
            for (const ve of pe.node.variants.edges) {
              const sku = ve.node.sku;
              if (sku) {
                const m = sku.toUpperCase().match(/L\d{3,5}/);
                if (m) allSkus.add(m[0]);
              }
            }
          }
          let units = 0, revenue = 0;
          if (allSkus.size > 0) {
            const pattern = Array.from(allSkus).join('|');
            const sql = `
              WITH line_items_unnested AS (
                SELECT
                  UPPER(JSON_VALUE(li, '$.sku')) AS sku_raw,
                  CAST(JSON_VALUE(li, '$.quantity') AS FLOAT64) AS qty,
                  CAST(JSON_VALUE(li, '$.price') AS FLOAT64) AS unit_price
                FROM \`larroude-data-prod.${dataset}.orders\` o,
                  UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
                WHERE DATE(o.created_at, '${TZ[market]}') BETWEEN @since AND @until
                  AND o.cancelled_at IS NULL
                  AND o.test = FALSE
                  ${pixFilter}
                  AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'${EXCLUDED_TAGS}')
                  AND (JSON_VALUE(o.customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'${EXCLUDED_TAGS}'))
                  AND CAST(o.total_price AS NUMERIC) < ${MAX_ORDER_VALUE[market]}
              )
              SELECT
                SUM(qty) AS units,
                SUM(qty * unit_price) AS revenue
              FROM line_items_unnested
              WHERE sku_raw IS NOT NULL AND REGEXP_CONTAINS(sku_raw, r'(${pattern})')
            `;
            const rows = await runQuery<{ units: number | string; revenue: number | string }>(sql, { since, until });
            units = Number(rows[0]?.units) || 0;
            revenue = Number(rows[0]?.revenue) || 0;
          }
          collectionsResult[colId] = {
            title: col.title,
            image: col.image?.url ?? null,
            productCount: col.productsCount?.count ?? col.products.edges.length,
            units,
            revenue,
            currency,
          };
        } catch (e) {
          console.warn(`[creatives-performance] collection ${colId} error:`, e);
          collectionsResult[colId] = { title: null, image: null, productCount: 0, units: 0, revenue: 0, currency };
        }
      }));
    } else {
      for (const id of collections) {
        collectionsResult[id] = { title: null, image: null, productCount: 0, units: 0, revenue: 0, currency };
      }
    }

    return NextResponse.json({ skus: skusResult, collections: collectionsResult }, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[creatives-performance] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

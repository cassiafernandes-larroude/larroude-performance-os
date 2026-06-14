// Cassia 2026-06-14: cruza criativos Meta com vendas reais no Shopify (BigQuery).
// POST { market: 'US'|'BR', since: 'YYYY-MM-DD', until: 'YYYY-MM-DD', skus: string[] }
// Response: { [sku]: { units: number, revenue: number, productName: string|null, currency: 'USD'|'BRL' } }
//
// Cruza apenas DTC — usa os mesmos filtros do Main Dashboard (exclui B2B, PIX não-pago,
// orders acima do threshold).

import { NextRequest, NextResponse } from 'next/server';
import { hasBigQueryCredentials } from '@/lib/bigquery/client';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

interface RequestBody {
  market: 'US' | 'BR';
  since: string;
  until: string;
  skus: string[];
}

interface SkuPerformance {
  units: number;
  revenue: number;
  productName: string | null;
  currency: 'USD' | 'BRL';
}

const MAX_ORDER_VALUE = { US: 30000, BR: 25000 } as const;
const TZ = { US: 'America/New_York', BR: 'America/Sao_Paulo' } as const;
const EXCLUDED_TAGS = 'b2b|wholesale|marketplace|redo';

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { market, since, until, skus } = body;

    if (!market || !since || !until || !Array.isArray(skus)) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    if (!hasBigQueryCredentials()) {
      return NextResponse.json({ error: 'BigQuery not configured' }, { status: 503 });
    }
    if (skus.length === 0) {
      return NextResponse.json({});
    }

    const { runQuery } = await import('@/lib/bigquery/client');
    const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
    const currency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';

    // SKU prefix match — qualquer linha cujo SKU comece com L0042 (case-insensitive).
    // Construímos regex disjunctiva via UPPER LIKE; BigQuery não suporta IN para LIKE.
    // Usamos REGEXP_CONTAINS com pattern (L0042|L1234|...).
    const skuPattern = skus.map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean).join('|');
    if (!skuPattern) {
      return NextResponse.json({});
    }

    // Filtros DTC alinhados com Main/CAC
    const pixFilter = market === 'BR'
      ? `AND o.financial_status NOT IN ('voided','refunded','pending','expired','authorized')`
      : `AND o.financial_status NOT IN ('voided','refunded')`;

    const sql = `
      WITH line_items_unnested AS (
        SELECT
          o.id AS order_id,
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
          -- Extrai o "código mãe" (L\\d+) do SKU pra agrupar
          REGEXP_EXTRACT(sku_raw, r'(L\\d{3,5})') AS mother_code,
          title,
          qty,
          unit_price
        FROM line_items_unnested
        WHERE sku_raw IS NOT NULL
          AND REGEXP_CONTAINS(sku_raw, r'(${skuPattern})')
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

    const rows = await runQuery<{
      sku: string;
      product_name: string | null;
      units: number | string;
      revenue: number | string;
    }>(sql, { since, until });

    const result: Record<string, SkuPerformance> = {};
    for (const r of rows) {
      result[r.sku] = {
        units: Number(r.units) || 0,
        revenue: Number(r.revenue) || 0,
        productName: r.product_name ?? null,
        currency,
      };
    }
    // Sku não encontrado vira 0/0 — preenche pra o cliente não ter undefined
    for (const sku of skus) {
      if (!result[sku]) {
        result[sku] = { units: 0, revenue: 0, productName: null, currency };
      }
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[creatives-performance] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

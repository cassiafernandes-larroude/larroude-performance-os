// Cassia 2026-06-15: variantes (tamanho) por mother SKU para o modal drill-down do Inventory.
// Endpoint: /api/inventory/{US|BR}/variants/{mother_sku}
//
// Retorna estoque por tamanho separado por localização (Em Estoque / On-Demand / From-Batch),
// conforme regras documentadas em DOCUMENTACAO-COMPLETA-dashboards-larroude.md §8.7.
//
// Cassia: BR Sale = LARROUDE RS (104995258682)
//         BR On-Demand = Possibility Factory (113962942778)
//         BR From-Batch = Senda Factory (113962910010)
//         US Sale = LARROUDE RS + REDO + Ship Essential NY (75024760998, 81547165862, 82259476646)
//         US On-Demand = Possibility Factory (82824921254)
//         US From-Batch = Senda Factory (82824822950)

import { NextRequest, NextResponse } from 'next/server';
import { getBQ } from '@/lib/main-dashboard/bigquery';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
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

export async function GET(_req: NextRequest, { params }: { params: { market: string; mothersku: string } }) {
  const market = (params.market || '').toUpperCase() as 'US' | 'BR';
  const motherSku = decodeURIComponent(params.mothersku || '');

  if (!['US', 'BR'].includes(market)) {
    return NextResponse.json({ error: 'Invalid market. Use US or BR.' }, { status: 400 });
  }
  if (!motherSku || !motherSku.startsWith('L')) {
    return NextResponse.json({ error: 'Invalid mother SKU.' }, { status: 400 });
  }

  // Tenta primeiro o upstream do dashboard original (caso ele tenha esse endpoint)
  try {
    const upstream = await fetch(
      `https://larroude-inventory-dashboard.vercel.app/api/inventory/${market}/variants/${encodeURIComponent(motherSku)}`,
      { next: { revalidate: 600 } }
    );
    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
      });
    }
  } catch {
    /* fall through to BigQuery direct */
  }

  // Fallback: consulta BigQuery direto
  try {
    const bq = getBQ();
    const dataset = market === 'US' ? 'shopify_us' : 'shopify_br';
    const locs = LOCATIONS[market];

    const query = `
      WITH variants AS (
        SELECT
          pv.sku,
          pv.inventory_item_id,
          REGEXP_REPLACE(pv.sku, r'^(L\\d+-[A-Z]+)-[\\d.]+-', r'\\1-') AS mother_sku,
          REGEXP_EXTRACT(pv.sku, r'^L\\d+-[A-Z]+-([\\d.]+)-') AS size,
          ROW_NUMBER() OVER (PARTITION BY pv.sku ORDER BY pv._airbyte_extracted_at DESC) rn
        FROM \`larroude-data-platform.${dataset}.product_variants\` pv
        WHERE pv.sku LIKE 'L%'
      ),
      filtered AS (
        SELECT * FROM variants
        WHERE rn = 1 AND mother_sku = @mother_sku
      ),
      inventory AS (
        SELECT
          il.inventory_item_id,
          il.location_id,
          SAFE_CAST(il.available AS INT64) AS available,
          ROW_NUMBER() OVER (
            PARTITION BY il.inventory_item_id, il.location_id
            ORDER BY il._airbyte_extracted_at DESC
          ) rn
        FROM \`larroude-data-platform.${dataset}.inventory_levels\` il
        WHERE il.inventory_item_id IN (SELECT inventory_item_id FROM filtered)
      )
      SELECT
        fv.sku,
        fv.size,
        SUM(CASE WHEN i.location_id IN UNNEST(@instock_locs) THEN i.available ELSE 0 END) AS in_stock,
        SUM(CASE WHEN i.location_id = @ondemand_loc THEN i.available ELSE 0 END) AS on_demand,
        SUM(CASE WHEN i.location_id = @frombatch_loc THEN i.available ELSE 0 END) AS from_batch
      FROM filtered fv
      LEFT JOIN inventory i
        ON i.inventory_item_id = fv.inventory_item_id AND i.rn = 1
      GROUP BY fv.sku, fv.size
      ORDER BY SAFE_CAST(fv.size AS FLOAT64) ASC NULLS LAST
    `;

    const [rows] = await bq.query({
      query,
      params: {
        mother_sku: motherSku,
        instock_locs: locs.instock,
        ondemand_loc: locs.ondemand,
        frombatch_loc: locs.frombatch,
      },
      useLegacySql: false,
    });

    return NextResponse.json({
      market,
      motherSku,
      generatedAt: new Date().toISOString(),
      variants: rows.map((r: any) => ({
        sku: r.sku,
        size: r.size,
        inStock: Number(r.in_stock || 0),
        onDemand: Number(r.on_demand || 0),
        fromBatch: Number(r.from_batch || 0),
        total: Number(r.in_stock || 0) + Number(r.on_demand || 0) + Number(r.from_batch || 0),
      })),
    }, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[inventory variants] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

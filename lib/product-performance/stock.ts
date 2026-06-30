// Cassia 2026-06-29: estoque por SKU-mãe para o carrossel de mais vendidos (Performance de Produto).
// Três buckets por location do Shopify (definição da Cássia):
//   Físico  = estoque real em armazém  — US: LARROUDE RS + Ship Essential ; BR: LARROUDE RS
//   Remessa = lote em produção (Senda) — US/BR: Senda Factory
//   D2D     = produção sob demanda     — US/BR: Possibility Factory (estoque virtual 9999/tamanho)
// Fonte: BigQuery stg_shopify(.._br).inventory_levels (available vem do JSON `quantities`, name=available;
// a coluna `available` está deprecada/NULL) + inventory_items (sku). Validado vs Shopify Admin ao vivo.
// D2D é sentinela de "ilimitado" — a UI mostra como "sob demanda", não como contagem.

import { runQuery } from '@/lib/bigquery/client';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';

export type Market = 'US' | 'BR';
export interface StockBuckets { fisico: number; remessa: number; d2d: number }

const CFG: Record<Market, { ds: string; fisico: number[]; remessa: number; d2d: number }> = {
  US: { ds: 'stg_shopify',    fisico: [75024760998, 82259476646], remessa: 82824822950,  d2d: 82824921254 },
  BR: { ds: 'stg_shopify_br', fisico: [104995258682],             remessa: 113962910010, d2d: 113962942778 },
};

/** Limiar do sentinela de produção sob demanda (Possibility grava 9999/tamanho). */
export const D2D_ONDEMAND_THRESHOLD = 9999;

export async function getStockByMother(market: Market): Promise<Record<string, StockBuckets>> {
  return memo(`pp-stock:${market}:v1`, TTL_30M, async () => {
    const c = CFG[market];
    const sql = `
      WITH lv AS (
        SELECT il.location_id,
          REGEXP_REPLACE(ii.sku, r'^(L\\d+-[A-Z]+)-[0-9.]+-', r'\\1-') AS mother,
          (SELECT SUM(CAST(JSON_VALUE(q,'$.quantity') AS INT64))
           FROM UNNEST(JSON_QUERY_ARRAY(il.quantities)) q
           WHERE JSON_VALUE(q,'$.name') = 'available') AS avail
        FROM \`larroude-data-prod.${c.ds}.inventory_levels\` il
        JOIN \`larroude-data-prod.${c.ds}.inventory_items\` ii ON ii.id = il.inventory_item_id
        WHERE ii.sku LIKE 'L%'
      )
      SELECT mother,
        SUM(IF(location_id IN (${c.fisico.join(',')}), IFNULL(avail, 0), 0)) AS fisico,
        SUM(IF(location_id = ${c.remessa}, IFNULL(avail, 0), 0)) AS remessa,
        SUM(IF(location_id = ${c.d2d}, IFNULL(avail, 0), 0)) AS d2d
      FROM lv
      WHERE mother IS NOT NULL
      GROUP BY mother`;
    const rows = await runQuery<{ mother: string; fisico: number; remessa: number; d2d: number }>(sql);
    const out: Record<string, StockBuckets> = {};
    for (const r of rows) {
      out[r.mother] = { fisico: Number(r.fisico) || 0, remessa: Number(r.remessa) || 0, d2d: Number(r.d2d) || 0 };
    }
    return out;
  });
}

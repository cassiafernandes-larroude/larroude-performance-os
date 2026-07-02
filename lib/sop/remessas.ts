// Cassia 2026-07-02: camada S&OP da aba Performance de Produto — pares "a caminho"
// (pendentes de produção) por SKU-mãe, a partir das MESMAS silver que lib/producao/bq.ts lê:
//   silver.vpcp_remessa (header: dt_entrega, eh_encerrado) + silver.vpcp_op (OP × cod_ref × qtd)
//   + silver.vw_baixa_par_saidas (montagem: sku real + baixados).
// Regra de SKU igual à do /producao: sku da montagem da própria remessa → histórico do cod_ref
// (se cor única) → cod_ref. Depois normaliza pro SKU-mãe do Shopify (remove segmento de tamanho).
// Senda tem datas digitadas erradas (dt_entrega até ano 8025) — próxima entrega só conta datas
// entre hoje e hoje+2 anos.

import { runQuery } from '@/lib/bigquery/client';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';

const SILVER = 'larroude-data-platform.silver';

export interface PendingBySku { pendingPairs: number; nextDelivery: string | null }

// O client @google-cloud/bigquery devolve DATE como { value: 'YYYY-MM-DD' }, não string.
function bqDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) return String((v as { value: string }).value);
  return String(v);
}

// SKU-mãe do Shopify = sku sem o segmento de tamanho (mesma regra do stock.ts / forecast).
function toMotherSku(sku: string): string {
  return sku
    .replace(/^(L\d+-[A-Z]+)-[0-9.]+-/, '$1-')   // L750-CALF-9.0-BLACK-01 → L750-CALF-BLACK-01
    .replace(/-\d+\.\d+(?=-|$)/, '');            // fallback: remove "-9.0" em outra posição
}

/**
 * Pares pendentes ("a caminho") + próxima entrega válida, agregados por SKU-mãe.
 * Só remessas ativas (eh_encerrado = 'F'). Best-effort: refs multi-cor sem montagem
 * ficam sob o cod_ref e não casam com SKU do Shopify (aparecem como "sem remessa").
 */
export async function getPendingByMotherSku(): Promise<Record<string, PendingBySku>> {
  return memo('sop-remessas:v1', TTL_30M, async () => {
    const rows = await runQuery<{ sku: string; pending_pairs: number; next_delivery: unknown }>(`
      WITH rem AS (
        SELECT remessa, dt_entrega
        FROM \`${SILVER}.vpcp_remessa\`
        WHERE eh_encerrado = 'F'
      ),
      op AS (
        SELECT remessa, cod_ref, SUM(quantidade) AS pares_totais
        FROM \`${SILVER}.vpcp_op\`
        WHERE remessa IN (SELECT remessa FROM rem)
        GROUP BY remessa, cod_ref
      ),
      mont AS (
        SELECT remessa, referencia AS cod_ref,
               ARRAY_AGG(DISTINCT sku IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS sku,
               SUM(quant) AS baixados
        FROM \`${SILVER}.vw_baixa_par_saidas\`
        WHERE remessa IN (SELECT remessa FROM rem)
        GROUP BY remessa, referencia
      ),
      ref2sku AS (
        -- Histórico cod_ref base → SKU canônico (mesma regra do lib/producao/bq.ts);
        -- n_skus > 1 = ref com várias cores → cor indefinida, não usa.
        SELECT base_ref, ANY_VALUE(sku) AS any_sku, COUNT(DISTINCT sku) AS n_skus
        FROM (
          SELECT SPLIT(referencia, '-')[OFFSET(0)] AS base_ref, sku
          FROM \`${SILVER}.vw_baixa_par_saidas\`
          WHERE sku IS NOT NULL AND referencia IS NOT NULL
        )
        GROUP BY base_ref
      ),
      linhas AS (
        SELECT
          COALESCE(m.sku, IF(r2.n_skus = 1, r2.any_sku, NULL), op.cod_ref) AS sku,
          GREATEST(op.pares_totais - IFNULL(m.baixados, 0), 0) AS pendentes,
          rem.dt_entrega
        FROM op
        JOIN rem USING (remessa)
        LEFT JOIN mont m ON m.remessa = op.remessa AND m.cod_ref = op.cod_ref
        LEFT JOIN ref2sku r2 ON r2.base_ref = SPLIT(op.cod_ref, '-')[OFFSET(0)]
      )
      SELECT sku,
        SUM(pendentes) AS pending_pairs,
        -- Senda: datas digitadas erradas (até ano 8025) — só entregas entre hoje e +2 anos.
        MIN(IF(dt_entrega BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 2 YEAR), dt_entrega, NULL)) AS next_delivery
      FROM linhas
      WHERE pendentes > 0 AND sku IS NOT NULL
      GROUP BY sku`);

    const out: Record<string, PendingBySku> = {};
    for (const r of rows) {
      const mother = toMotherSku(String(r.sku));
      const pares = Number(r.pending_pairs) || 0;
      if (pares <= 0) continue;
      const next = bqDate(r.next_delivery);
      const e = out[mother] || { pendingPairs: 0, nextDelivery: null };
      e.pendingPairs += pares;
      if (next && (!e.nextDelivery || next < e.nextDelivery)) e.nextDelivery = next;
      out[mother] = e;
    }
    return out;
  });
}

// Categoria de fulfillment (origem da venda) — FONTE UNICA.
//
// Cassia 2026-06-17: split "vendido com estoque vs sob demanda" por localizacao de
// fulfillment do Shopify (fulfillments[].location_id). Regras:
//   - from-batch  = Senda Factory
//   - on-demand   = Possibility Factory
//   - in-stock    = Larroude RS (BR);  Larroude RS + Redo + Ship Essential (US)
//   - pending     = order ainda sem fulfillment (nao despachada)
//   - other       = qualquer outra localizacao (dropship/Amazon/Flexport etc.)
//
// orders.location_id e' POS (quase sempre null) — a origem real vem do 1o fulfillment.
// O JSON de fulfillments NAO traz o nome da location (so location_id), e o BQ nao
// permite subquery correlacionada com JOIN na tabela locations; por isso mapeamos por
// ID (estaveis no Shopify). IDs globalmente unicos por loja -> a mesma lista serve US e BR.

import { getPreorderMotherSkusCached } from './preorder-skus';

export type FulfillmentCategory = 'in-stock' | 'on-demand' | 'from-batch' | 'pre-order' | 'pending' | 'other';

// location_id (Shopify) -> categoria. Atualizar aqui se uma location for recriada/adicionada.
export const FULFILLMENT_LOCATION_IDS = {
  fromBatch: ['113962910010', '82824822950'],                 // Senda Factory (BR, US)
  onDemand: ['113962942778', '82824921254'],                  // Possibility Factory (BR, US)
  inStock: [
    '104995258682', // LARROUDE RS (BR)
    '75024760998',  // LARROUDE RS (US)
    '81547165862',  // REDO WAREHOUSE (US)
    '82045075622',  // Redo Digital Warehouse (US)
    '82259476646',  // Ship Essential NY (US)
  ],
};

// Grupos para o filtro de UI. Cassia 2026-06-20: 3 origens —
//   In Stock = estoque; On-Demand = produzido por esgotar (on-demand + from-batch);
//   Pre-Order = pré-lançamento (atributo de PRODUTO, via coleção de pré-venda).
// Pre-order é EXCLUSIVO: removido de In Stock e On-Demand (ver fulfillmentCategoryFilterSQL).
export const FULFILLMENT_CATEGORY_GROUPS: { key: string; label: string; cats: FulfillmentCategory[] }[] = [
  { key: "in-stock", label: "In Stock", cats: ["in-stock"] },
  { key: "on-demand", label: "On-Demand", cats: ["on-demand", "from-batch"] },
  { key: "pre-order", label: "Pre-Order", cats: ["pre-order"] },
  // 'pending'/'other' continuam no enum/SQL, só não aparecem como pill.
];

const ALL_CATEGORIES: FulfillmentCategory[] = ['in-stock', 'on-demand', 'from-batch', 'pre-order', 'pending', 'other'];

// Cassia 2026-06-17: spend e' atribuido por NOME de campanha. Campanhas COM
// pre-order/preorder/pre-venda/pre venda = produzido (on-demand + from-batch);
// SEM = produto com estoque (in-stock). Regex unica p/ todos os dashboards baterem.
// (Estende o pre[\s_-]?order|preorder ja usado em main-dashboard com as variantes PT.)
export const PREORDER_CAMPAIGN_REGEX = String.raw`pre[\s_-]?order|preorder|pre[\s_-]?venda`;

/** true se o nome da campanha indica pre-order/pre-venda (produzido), no client/TS. */
export function isPreorderCampaign(name: string | null | undefined): boolean {
  if (!name) return false;
  return /pre[\s_-]?order|preorder|pre[\s_-]?venda/i.test(name);
}

function idIn(ids: string[]): string {
  return ids.map((x) => `'${x}'`).join(',');
}

/** Normaliza/valida uma lista de categorias vinda da query string (csv). */
export function parseFulfillmentCategories(raw: string | null | undefined): FulfillmentCategory[] | null {
  if (!raw) return null;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean) as FulfillmentCategory[];
  const valid = parts.filter((c) => ALL_CATEGORIES.includes(c));
  if (valid.length === 0) return null;
  return valid;
}

/**
 * Clausula WHERE de filtro por origem. categories null/vazio = sem filtro (tudo).
 *
 * Cassia 2026-06-17: usa a localizacao ATRIBUIDA (fulfillment_orders.assigned_location_id),
 * definida no momento do pedido — assim PRE-ORDER e' identificado mesmo antes de despachar
 * (a producao leva semanas; usar o fulfillment concluido jogava pre-orders em "pending").
 * Semi-join (IN) — suportado pelo BQ. `dataset` = 'stg_shopify' | 'stg_shopify_br'.
 */
// Expressão SQL: mother SKU (estilo+cor, sem tamanho) a partir de uma expr de variant sku.
// Replica motherSkuOf do catálogo. Usada pra casar line items com a lista pre-order.
function motherSkuSql(skuExpr: string): string {
  const s = skuExpr;
  return `CASE
    WHEN ${s} IS NULL OR ARRAY_LENGTH(SPLIT(${s}, '-')) < 3 THEN NULL
    WHEN ARRAY_LENGTH(SPLIT(${s}, '-')) >= 4 AND REGEXP_CONTAINS(SPLIT(${s}, '-')[SAFE_OFFSET(2)], r'^\\d+(\\.\\d+)?$')
      THEN CASE
        WHEN ARRAY_LENGTH(SPLIT(${s}, '-')) >= 5 AND IFNULL(SPLIT(${s}, '-')[SAFE_OFFSET(4)], '') != ''
          THEN CONCAT(SPLIT(${s}, '-')[SAFE_OFFSET(0)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(1)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(3)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(4)])
        ELSE CONCAT(SPLIT(${s}, '-')[SAFE_OFFSET(0)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(1)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(3)])
      END
    WHEN ARRAY_LENGTH(SPLIT(${s}, '-')) >= 4 AND IFNULL(SPLIT(${s}, '-')[SAFE_OFFSET(3)], '') != ''
      THEN CONCAT(SPLIT(${s}, '-')[SAFE_OFFSET(0)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(1)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(2)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(3)])
    ELSE CONCAT(SPLIT(${s}, '-')[SAFE_OFFSET(0)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(1)], '-', SPLIT(${s}, '-')[SAFE_OFFSET(2)])
  END`;
}

export function fulfillmentCategoryFilterSQL(
  categories: FulfillmentCategory[] | null | undefined,
  ordersAlias: string,
  dataset: string,
  preorderSkus?: string[] | null
): string {
  if (!categories || categories.length === 0) return '';
  const valid = categories.filter((c) => ALL_CATEGORIES.includes(c));
  if (valid.length === 0 || valid.length === ALL_CATEGORIES.length) return '';
  const a = ordersAlias ? `${ordersAlias}.` : '';
  const foTable = `\`larroude-data-prod.${dataset}.fulfillment_orders\``;
  const inSub = (idsX: string[]) =>
    `${a}id IN (SELECT order_id FROM ${foTable} WHERE CAST(assigned_location_id AS STRING) IN (${idIn(idsX)}))`;
  const preIds = [...FULFILLMENT_LOCATION_IDS.fromBatch, ...FULFILLMENT_LOCATION_IDS.onDemand];

  // Predicado PRE-ORDER por produto: pedido tem ≥1 line item cujo mother SKU está na
  // coleção de pré-venda. Lista vem do param ou do cache (mercado derivado do dataset).
  // Sem lista → FALSE (sem exclusão; comportamento antigo / degradação graciosa).
  const skus = preorderSkus ?? getPreorderMotherSkusCached(dataset.includes('_br') ? 'BR' : 'US');
  const preorderPred = skus && skus.length
    ? `EXISTS (SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(${a}line_items)) AS _pli WHERE ${motherSkuSql("JSON_VALUE(_pli, '$.sku')")} IN (${idIn(skus)}))`
    : 'FALSE';

  const wantOnDemand = valid.includes('on-demand') || valid.includes('from-batch');
  const wantIn = valid.includes('in-stock');
  const wantPreorder = valid.includes('pre-order');
  const conds: string[] = [];
  // EXCLUSIVO, precedência: Pre-Order (produto) > On-Demand (local Senda/Possibility) > In Stock.
  if (wantPreorder) conds.push(preorderPred);
  if (wantOnDemand) conds.push(`(${inSub(preIds)} AND NOT (${preorderPred}))`);
  if (wantIn) conds.push(`(${inSub(FULFILLMENT_LOCATION_IDS.inStock)} AND NOT (${inSub(preIds)}) AND NOT (${preorderPred}))`);
  if (valid.includes('pending')) {
    conds.push(`${a}id NOT IN (SELECT order_id FROM ${foTable} WHERE order_id IS NOT NULL)`);
  }
  if (!conds.length) return '';
  return `AND (${conds.join(' OR ')})`;
}

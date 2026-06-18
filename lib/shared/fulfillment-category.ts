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

export type FulfillmentCategory = 'in-stock' | 'on-demand' | 'from-batch' | 'pending' | 'other';

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

// Grupos para o filtro de UI. Cassia 2026-06-17: on-demand + from-batch consolidados
// em "Pre-order" (produzido). Cada pill controla 1+ categorias internas.
export const FULFILLMENT_CATEGORY_GROUPS: { key: string; label: string; cats: FulfillmentCategory[] }[] = [
  { key: "in-stock", label: "Em estoque", cats: ["in-stock"] },
  { key: "pre-order", label: "Pré-order", cats: ["on-demand", "from-batch"] },
  { key: "pending", label: "Pendente", cats: ["pending"] },
];

const ALL_CATEGORIES: FulfillmentCategory[] = ['in-stock', 'on-demand', 'from-batch', 'pending', 'other'];

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

/** Expressao SQL (de-correlacionada) que retorna a categoria de fulfillment de uma order. */
export function orderFulfillmentCategorySQL(ordersAlias = ''): string {
  const a = ordersAlias ? `${ordersAlias}.` : '';
  return `CASE WHEN ARRAY_LENGTH(JSON_QUERY_ARRAY(${a}fulfillments)) = 0 THEN 'pending' ELSE (
    SELECT CASE
      WHEN JSON_VALUE(f, '$.location_id') IN (${idIn(FULFILLMENT_LOCATION_IDS.fromBatch)}) THEN 'from-batch'
      WHEN JSON_VALUE(f, '$.location_id') IN (${idIn(FULFILLMENT_LOCATION_IDS.onDemand)}) THEN 'on-demand'
      WHEN JSON_VALUE(f, '$.location_id') IN (${idIn(FULFILLMENT_LOCATION_IDS.inStock)}) THEN 'in-stock'
      ELSE 'other' END
    FROM UNNEST(JSON_QUERY_ARRAY(${a}fulfillments)) f LIMIT 1
  ) END`;
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
 * Clausula WHERE de filtro. categories null/vazio = sem filtro (mostra tudo).
 * Valores vem de enum interno (nao input livre) -> seguro inline.
 */
export function fulfillmentCategoryFilterSQL(
  categories: FulfillmentCategory[] | null | undefined,
  ordersAlias = ''
): string {
  if (!categories || categories.length === 0) return '';
  const valid = categories.filter((c) => ALL_CATEGORIES.includes(c));
  if (valid.length === 0 || valid.length === ALL_CATEGORIES.length) return '';
  const inList = valid.map((c) => `'${c}'`).join(',');
  return `AND (${orderFulfillmentCategorySQL(ordersAlias)}) IN (${inList})`;
}

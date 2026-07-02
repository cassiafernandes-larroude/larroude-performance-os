// Filtros DTC (Direct-to-Consumer) — FONTE UNICA DE VERDADE.
//
// REGRAS-LARROUDE-OS.md secao 1 + "regra de ouro" (secao 10): os mesmos KPIs
// (ORDERS, NEW CUSTOMERS, GROSS SALES, AOV...) devem bater EXATAMENTE entre
// Main Dashboard, CAC, LTV e Overview. Ate 2026-06-17 cada dashboard tinha sua
// propria copia do filtro e elas divergiam silenciosamente:
//   - Main/CAC nao excluiam a tag `influencer` (LTV/UE excluiam)
//   - Main/CAC/Overview nao excluiam trocas (Loop/TroquEcommerce) (LTV/NorthStar excluiam)
//   - Main/Overview nao excluiam cancelled_at/test
//
// Cassia 2026-06-17: centralizado aqui. Qualquer query Shopify nova DEVE importar
// destes helpers em vez de re-declarar a regex/cap/clausula de trocas.

export type DtcMarket = "US" | "BR";

// Tags de exclusao (na order OU no customer). `influencer` = brindes/seeding, nao e' venda DTC.
export const EXCLUDED_TAGS_REGEX = "b2b|wholesale|marketplace|redo|influencer";

// Cap de valor por order — acima disso e' tipicamente atacado/marketplace/redo.
export const DTC_MAX_ORDER_VALUE: Record<DtcMarket, number> = { US: 30000, BR: 25000 };

/**
 * Clausula que exclui trocas (substituicao sem nova receita):
 *   - BR: TroquEcommerce (tags/note)
 *   - US: Loop Returns (name 'EXC-' prefix, notes de exchange, tag 'loop:')
 * Aplica os dois conjuntos independente do mercado (inofensivo — um nao casa no outro).
 *
 * @param alias prefixo da tabela (ex.: 'o'); vazio = colunas sem alias
 */
export function excludeExchangesSQL(alias = ""): string {
  const a = alias ? `${alias}.` : "";
  return `AND NOT (
      LOWER(IFNULL(${a}tags, '')) LIKE '%troquecommerce%'
      OR LOWER(IFNULL(${a}note, '')) LIKE '%troca direta%'
      OR LOWER(IFNULL(${a}note, '')) LIKE '%troquecommerce%'
      OR ${a}name LIKE 'EXC-%'
      OR LOWER(IFNULL(${a}note, '')) LIKE '%new exchange order%'
      OR LOWER(IFNULL(${a}note, '')) LIKE '%exchange for order%'
      OR LOWER(IFNULL(${a}tags, '')) LIKE '%loop:%'
    )`;
  // Cassia 2026-06-21: a tag de troca 'le:exchange' (nova "compra" de uma troca = cancelamento +
  // recompra) NÃO é excluída aqui de propósito — este filtro alimenta GMV/receita (Main/Overview/
  // CAC/Shopify), onde a troca é a venda realizada (o original foi cancelado). A exclusão de
  // 'le:exchange' como "compra genuína" vive no COMMON_FILTERS_BASE do LTV (recorrência/Clientes).
  // Mudar receita = decisão de negócio explícita.
}

// Cassia 2026-07-02: desde Mar/2026 o app Redo adiciona um line item de $4.98
// (sku 'x-redo', "Free Returns Coverage") em quase toda order US (~6-8k itens/mes).
// Nao e' par vendido — qualquer SUM de quantity sobre line_items inflava units US ~20%.
// Guard de NIVEL DE LINE ITEM: aplicar em toda query que faz UNNEST(line_items).
export const REDO_COVERAGE_SKU = "x-redo";

/**
 * Exclui o line item de cobertura do Redo (sku 'x-redo') em CTEs que fazem
 * UNNEST(JSON_QUERY_ARRAY(line_items)). Filtro de LINHA, nao de order.
 * @param liVar nome da variavel do UNNEST (ex.: 'li')
 */
export function excludeRedoLineItemSQL(liVar = "li"): string {
  return `AND LOWER(IFNULL(JSON_VALUE(${liVar}, '$.sku'), '')) != '${REDO_COVERAGE_SKU}'`;
}

/**
 * Clausula de exclusao por TAGS (order + customer). Usa a regex canonica.
 * @param alias prefixo da tabela (ex.: 'o'); vazio = colunas sem alias
 */
export function excludeTagsSQL(alias = ""): string {
  const a = alias ? `${alias}.` : "";
  return `AND NOT REGEXP_CONTAINS(LOWER(IFNULL(${a}tags, '')), r'${EXCLUDED_TAGS_REGEX}')
    AND (JSON_VALUE(${a}customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(${a}customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}'))`;
}

/**
 * Cassia 2026-07-02: REGRA CANONICA de financial_status (alinhamento com o financeiro/Enrico):
 *   - `refunded` agora e' INCLUIDO — a venda conta no mes em que aconteceu (visao bruta +
 *     devolucoes rastreadas a parte). Antes exclui-lo fazia o historico mudar retroativamente
 *     quando a devolucao acontecia. Os motores que exibem "net" ja' netam pelo VALOR dos
 *     refunds (NET_SALES_EXPR / refund_value / refund line items) — isso continua.
 *   - `pending/expired/authorized` excluidos nos DOIS mercados (antes so' BR/PIX) — pedido
 *     nao pago nao e' venda, em nenhum mercado.
 * Mesma clausula para US e BR.
 * @param alias prefixo da tabela (ex.: 'o'); vazio = colunas sem alias
 */
export function financialStatusSQL(alias = ""): string {
  const a = alias ? `${alias}.` : "";
  return `AND ${a}financial_status NOT IN ('voided','pending','expired','authorized')`;
}

/**
 * Filtro DTC "core" completo para CTEs sobre a tabela de orders.
 * Inclui: tags(order+customer) + cap de valor + cancelled + test + financial_status canonico
 * (refunded INCLUIDO, nao-pago excluido nos dois mercados) + trocas.
 *
 * Cassia 2026-07-02: financial_status passou a fazer parte do core (antes era inline em cada
 * query com `NOT IN ('voided','refunded')`). NAO re-aplicar filtros de financial_status por
 * fora — quem precisa de excecao (ex.: bucket PIX-pendente do funil) monta o proprio WHERE.
 *
 * @param market 'US' | 'BR'
 * @param alias prefixo da tabela (ex.: 'o'); vazio = colunas sem alias
 */
export function dtcCoreFilters(market: DtcMarket, alias = ""): string {
  return `
    AND ${alias ? `${alias}.` : ""}cancelled_at IS NULL
    AND ${alias ? `${alias}.` : ""}test = FALSE
    ${excludeTagsSQL(alias)}
    AND CAST(${alias ? `${alias}.` : ""}total_price AS NUMERIC) < ${DTC_MAX_ORDER_VALUE[market]}
    ${financialStatusSQL(alias)}
    ${excludeExchangesSQL(alias)}`;
}

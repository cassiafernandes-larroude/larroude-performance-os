/**
 * Unit Economics — query principal por mother SKU + variant SKU.
 *
 * Cascata por unidade (REGRAS-LARROUDE-OS.md):
 *   Preço líquido pós-desconto
 *   (−) Impostos (tax)
 *   (−) Devoluções (refunds)
 *   = Receita líquida / un
 *   (−) COGS + tarifas (cost_of_goods_sold + duties)
 *   (−) Taxa de cartão
 *   (−) Frete (premissa)
 *   (−) Fulfillment (premissa)
 *   (−) Custo de troca (premissa)
 *   = MC Bruta / un
 *   (−) Marketing / un
 *   = MC Líquida / un
 *
 * Filtros: DTC apenas, exclui B2B/marketplace/influencer/redo, exclui
 * mother_sku lixo (x-* ou puramente numérico).
 */

import { runQuery } from './bigquery';

export type Market = 'US' | 'BR';

const EXCLUDED_TAGS_REGEX = 'b2b|wholesale|marketplace|redo|influencer';
const MAX_ORDER_VALUE: Record<Market, number> = { US: 30000, BR: 25000 };

export interface ProductUnitEconomics {
  motherSku: string;
  variantSku: string | null; // null pra agregado mother, populated pra drill-down
  productName: string;
  totalUnits: number;
  totalOrders: number;
  /** Receita unitária bruta (preço × qty / qty = preço médio ponderado) */
  unitGrossRevenue: number;
  unitDiscount: number;
  unitTax: number;
  unitDuties: number;
  unitCogs: number;
  unitRefund: number;
  /** Taxa de troca (REDO) dos ultimos 30d — 0..1. Aplicada no cascade.exchange. */
  exchangeRate?: number;
  /** Taxa de devolucao dos ultimos 30d — 0..1. Refunded qty / total qty por mother SKU. */
  returnRate30d?: number;
  /** Total qty 30d (refunded + bruto) usado no calculo de returnRate30d. */
  returnTotalQty30d?: number;
  /** Refunded qty 30d. */
  returnRefundedQty30d?: number;
  /** % do volume pago em PIX (0..1). 0 para US. */
  pixShare: number;
  /** Currency */
  currency: 'USD' | 'BRL';
}

export interface UnitEconomicsResponse {
  market: Market;
  startDate: string;
  endDate: string;
  currency: 'USD' | 'BRL';
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  totalRefunds: number;
  /** Cobertura de marketing — % de unidades com spend atribuído */
  marketingCoverage: number;
  /** Spend marketing total no período (Meta + Google) já em moeda local */
  totalMarketingSpend: number;
  metaSpend: number;
  googleSpend: number;
  /** Lista de mother SKUs (rollup) */
  products: ProductUnitEconomics[];
  /** Drill-down: cada mother SKU expandido em variant SKUs */
  variants: ProductUnitEconomics[];
}

function ordersDataset(market: Market): string {
  return market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
}

/**
 * SQL helper: extrair mother SKU do variant SKU.
 * Regra: parts[0] começa com letras+dígitos. Se parts[2] for número (tamanho), pula.
 * Resultado: parts[0]-parts[1]-parts[N] (cor).
 *
 * Exemplos:
 *   L497-GABE-9.0-CLEA-2699 → L497-GABE-CLEA
 *   C-BRACE-GOLD-XX → C-BRACE-GOLD (sem tamanho)
 *   BAG-PETIT-BLACK → BAG-PETIT-BLACK
 */
const MOTHER_SKU_EXPR = `
  CASE
    WHEN variant_sku IS NULL THEN NULL
    WHEN ARRAY_LENGTH(SPLIT(variant_sku, '-')) >= 4
         AND REGEXP_CONTAINS(SPLIT(variant_sku, '-')[SAFE_OFFSET(2)], r'^\\d+(\\.\\d+)?$')
    THEN CONCAT(
      SPLIT(variant_sku, '-')[SAFE_OFFSET(0)], '-',
      SPLIT(variant_sku, '-')[SAFE_OFFSET(1)], '-',
      SPLIT(variant_sku, '-')[SAFE_OFFSET(3)]
    )
    WHEN ARRAY_LENGTH(SPLIT(variant_sku, '-')) >= 3
    THEN CONCAT(
      SPLIT(variant_sku, '-')[SAFE_OFFSET(0)], '-',
      SPLIT(variant_sku, '-')[SAFE_OFFSET(1)], '-',
      SPLIT(variant_sku, '-')[SAFE_OFFSET(2)]
    )
    ELSE NULL
  END
`;

export async function getUnitEconomics(
  market: Market,
  startDate: string,
  endDate: string
): Promise<Omit<UnitEconomicsResponse, 'products' | 'variants' | 'totalMarketingSpend' | 'metaSpend' | 'googleSpend' | 'marketingCoverage'> & {
  products: ProductUnitEconomics[];
  variants: ProductUnitEconomics[];
}> {
  const dataset = ordersDataset(market);
  const cap = MAX_ORDER_VALUE[market];
  const currency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';

  const sql = `
    WITH
    valid_orders AS (
      SELECT
        o.id AS order_id,
        DATE(o.created_at) AS order_date,
        o.line_items,
        o.refunds,
        o.payment_gateway_names,
        CAST(o.total_price AS NUMERIC) AS order_total
      FROM \`larroude-data-prod.${dataset}.orders\` o
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        AND o.cancelled_at IS NULL
        AND o.test = FALSE
        AND o.financial_status NOT IN ('voided', 'refunded')
        AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'${EXCLUDED_TAGS_REGEX}')
        AND (JSON_VALUE(o.customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}'))
        AND CAST(o.total_price AS NUMERIC) < ${cap}
        -- DTC: exclui marketplaces
        AND (o.source_name IS NULL OR LOWER(o.source_name) NOT IN ('amazon_marketplace_web', 'mercado_livre', 'mercado_libre'))
    ),
    items_raw AS (
      SELECT
        o.order_id,
        o.order_date,
        o.payment_gateway_names,
        JSON_VALUE(li, '$.sku') AS variant_sku,
        JSON_VALUE(li, '$.title') AS title,
        JSON_VALUE(li, '$.name') AS variant_full_name,
        CAST(JSON_VALUE(li, '$.id') AS INT64) AS line_item_id,
        CAST(JSON_VALUE(li, '$.quantity') AS NUMERIC) AS qty,
        CAST(JSON_VALUE(li, '$.price') AS NUMERIC) AS unit_price,
        CAST(JSON_VALUE(li, '$.total_discount') AS NUMERIC) AS line_discount,
        -- Soma todos os tax_lines do line item
        (
          SELECT IFNULL(SUM(CAST(JSON_VALUE(t, '$.price') AS NUMERIC)), 0)
          FROM UNNEST(JSON_QUERY_ARRAY(li, '$.tax_lines')) AS t
        ) AS line_tax,
        -- Soma duties (line_item.duties[].price)
        (
          SELECT IFNULL(SUM(CAST(JSON_VALUE(d, '$.harmonized_system_journal_line.price_set.shop_money.amount') AS NUMERIC)), 0)
          FROM UNNEST(JSON_QUERY_ARRAY(li, '$.duties')) AS d
        ) AS line_duties
      FROM valid_orders o,
        UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
    ),
    -- Refunds: line_item_id → quantidade devolvida + valor reembolsado
    refunds_per_line AS (
      SELECT
        o.order_id,
        CAST(JSON_VALUE(rli, '$.line_item_id') AS INT64) AS line_item_id,
        IFNULL(SUM(CAST(JSON_VALUE(rli, '$.quantity') AS NUMERIC)), 0) AS refunded_qty,
        IFNULL(SUM(CAST(JSON_VALUE(rli, '$.subtotal') AS NUMERIC)), 0) AS refunded_amount
      FROM valid_orders o,
        UNNEST(JSON_QUERY_ARRAY(o.refunds)) AS r,
        UNNEST(JSON_QUERY_ARRAY(r, '$.refund_line_items')) AS rli
      GROUP BY o.order_id, line_item_id
    ),
    items AS (
      SELECT
        i.*,
        ${MOTHER_SKU_EXPR} AS mother_sku,
        IFNULL(r.refunded_qty, 0) AS refunded_qty,
        IFNULL(r.refunded_amount, 0) AS refunded_amount,
        -- PIX detect (payment_gateway_names é JSON array de strings)
        EXISTS (
          SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(i.payment_gateway_names)) AS pg
          WHERE REGEXP_CONTAINS(LOWER(JSON_VALUE(pg, '$')), r'pix')
        ) AS is_pix
      FROM items_raw i
      LEFT JOIN refunds_per_line r
        ON r.order_id = i.order_id AND r.line_item_id = i.line_item_id
    ),
    -- Exclui lixo de SKU (x-*, puramente numérico)
    -- COGS NÃO vem do BQ (policy tag PII bloqueia inventory_items.cost) —
    -- enriquecido no servidor via Shopify Admin GraphQL (lib/unit-economics/shopify-cogs.ts)
    items_clean AS (
      SELECT i.*, CAST(0 AS NUMERIC) AS unit_cogs FROM items i
      WHERE mother_sku IS NOT NULL
        AND NOT REGEXP_CONTAINS(LOWER(mother_sku), r'^x-')
        AND NOT REGEXP_CONTAINS(mother_sku, r'^[0-9]+$')
        AND qty > 0
    )
    SELECT
      mother_sku,
      variant_sku,
      ANY_VALUE(title) AS product_name,
      ANY_VALUE(variant_full_name) AS variant_full_name,
      SUM(qty) AS total_units,
      COUNT(DISTINCT order_id) AS total_orders,
      SUM(unit_price * qty) AS gross_revenue,
      SUM(line_discount) AS total_discount,
      SUM(line_tax) AS total_tax,
      SUM(line_duties) AS total_duties,
      SUM(unit_cogs * qty) AS total_cogs,
      SUM(refunded_amount) AS total_refunds,
      SUM(refunded_qty) AS refunded_units,
      SUM(IF(is_pix, qty, 0)) AS pix_units
    FROM items_clean
    GROUP BY GROUPING SETS ((mother_sku), (mother_sku, variant_sku))
    HAVING total_units > 0
    ORDER BY mother_sku, variant_sku NULLS FIRST
  `;

  const rows = await runQuery<{
    mother_sku: string;
    variant_sku: string | null;
    product_name: string;
    variant_full_name: string | null;
    total_units: number;
    total_orders: number;
    gross_revenue: number;
    total_discount: number;
    total_tax: number;
    total_duties: number;
    total_cogs: number;
    total_refunds: number;
    refunded_units: number;
    pix_units: number;
  }>(sql, { start: startDate, end: endDate });

  // Separa mother (variant_sku null) e variants (variant_sku populated)
  const products: ProductUnitEconomics[] = [];
  const variants: ProductUnitEconomics[] = [];
  let totalUnits = 0;
  let totalOrders = 0;
  let totalRevenue = 0;
  let totalRefunds = 0;

  for (const r of rows) {
    const units = Number(r.total_units) || 0;
    if (units <= 0) continue;
    const grossRev = Number(r.gross_revenue) || 0;
    const discount = Number(r.total_discount) || 0;
    const tax = Number(r.total_tax) || 0;
    const duties = Number(r.total_duties) || 0;
    const cogs = Number(r.total_cogs) || 0;
    const refunds = Number(r.total_refunds) || 0;
    const pixUnits = Number(r.pix_units) || 0;
    const item: ProductUnitEconomics = {
      motherSku: r.mother_sku,
      variantSku: r.variant_sku,
      productName: r.variant_sku
        ? r.variant_full_name || r.variant_sku
        : r.product_name || r.mother_sku,
      totalUnits: units,
      totalOrders: Number(r.total_orders) || 0,
      unitGrossRevenue: grossRev / units,
      unitDiscount: discount / units,
      unitTax: tax / units,
      unitDuties: duties / units,
      unitCogs: cogs / units,
      unitRefund: refunds / units,
      pixShare: market === 'US' ? 0 : units > 0 ? pixUnits / units : 0,
      currency,
    };
    if (!r.variant_sku) {
      products.push(item);
      totalUnits += units;
      totalOrders += Number(r.total_orders) || 0;
      totalRevenue += grossRev - discount;
      totalRefunds += refunds;
    } else {
      variants.push(item);
    }
  }

  // Ordena produtos por volume desc
  products.sort((a, b) => b.totalUnits - a.totalUnits);

  return {
    market,
    startDate,
    endDate,
    currency,
    totalUnits,
    totalOrders,
    totalRevenue,
    totalRefunds,
    products,
    variants,
  };
}

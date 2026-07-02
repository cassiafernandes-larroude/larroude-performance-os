import type { Market } from "@/types/metric";
import { dtcCoreFilters, excludeRedoLineItemSQL } from "@/lib/shared/dtc-filters";
import { fulfillmentCategoryFilterSQL, PREORDER_CAMPAIGN_REGEX, type FulfillmentCategory } from "@/lib/shared/fulfillment-category";

const TZ: Record<Market, string> = {
  US: "America/New_York",
  BR: "America/Sao_Paulo",
};

const DATASET: Record<Market, string> = {
  US: "stg_shopify",
  BR: "stg_shopify_br",
};

// Query oficial replicada do larroude-dashboard-geral (lib/queries.ts:queryAggregatedKpis)
// Project: larroude-data-prod
//
// Ajustes (2026-05-22):
//   1. Excluir B2B/wholesale em US e BR (via customer.tags e order.tags)
//   2. Excluir PIX nao pago no BR (gateway LIKE '%pix%' AND financial_status = 'pending')
export function aggregatedKpisSQL(market: Market, fulCats?: FulfillmentCategory[] | null) {
  const dataset = DATASET[market];
  const tz = TZ[market];
  // Cassia 2026-06-17: filtro de origem de fulfillment (estoque/sob demanda/from-batch/pendente).
  const fulBare = fulfillmentCategoryFilterSQL(fulCats, '', dataset);
  const fulO = fulfillmentCategoryFilterSQL(fulCats, 'o', dataset);

  // BR: Meta da conta Larroude BR principal vem em USD → multiplicar por FX
  // Mas Pre-Order BR já está em BRL → não converter
  const spendExpr = market === "BR"
    ? `CASE
         WHEN LOWER(ad.channel) LIKE 'meta%' AND NOT REGEXP_CONTAINS(LOWER(ad.campaign_name), r'pre[\\s_-]?order|preorder')
           THEN ad.spend * IFNULL(fx.avg_rate_brl_usd, 5.0)
         ELSE ad.spend
       END`
    : `ad.spend`;

  const fxJoinSql = market === "BR"
    ? `LEFT JOIN \`larroude-data-prod.gold.fx_rates_monthly\` fx ON fx.month = FORMAT_DATE('%Y-%m', ad.date)`
    : "";

  // Cassia 2026-06-17: filtros DTC via fonte unica (lib/shared/dtc-filters) — regra de
  // ouro (REGRAS secao 1/10). Inclui agora tag `influencer`, cancelled/test, PIX nao-pago
  // BR e exclusao de trocas (Loop/TroquEcommerce) — antes faltavam aqui e o Overview
  // divergia de Main/CAC/LTV. O voided/refunded base continua inline.
  const ORDER_FILTERS = `financial_status NOT IN ('voided','pending','expired','authorized') ${dtcCoreFilters(market)} ${fulBare}`;

  return `
    WITH
    sales AS (
      SELECT
        SUM(CAST(total_line_items_price AS NUMERIC)) AS gross_sales,
        SUM(CAST(total_discounts AS NUMERIC)) AS discounts,
        SUM(CAST(total_price AS NUMERIC)) AS order_revenue,
        SUM(CAST(total_tax AS NUMERIC)) AS tax,
        COUNT(*) AS orders
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${tz}') BETWEEN @start AND @end
        AND ${ORDER_FILTERS}
    ),
    units_t AS (
      SELECT SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64)) AS units
      FROM \`larroude-data-prod.${dataset}.orders\` o,
           UNNEST(JSON_QUERY_ARRAY(line_items)) li
      WHERE DATE(o.created_at, '${tz}') BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided','pending','expired','authorized')
        ${dtcCoreFilters(market, 'o')}
        ${fulO}
        ${excludeRedoLineItemSQL('li')}
    ),
    refunds_raw AS (
      SELECT
        DATE(rf.created_at, '${tz}') AS d,
        (SELECT SUM(CAST(JSON_VALUE(t,'$.amount') AS NUMERIC))
         FROM UNNEST(JSON_QUERY_ARRAY(rf.transactions)) t
         WHERE JSON_VALUE(t,'$.kind') = 'refund') AS refund_amount
      FROM \`larroude-data-prod.${dataset}.order_refunds\` rf
      LEFT JOIN \`larroude-data-prod.${dataset}.orders\` o ON o.id = rf.order_id
      WHERE DATE(rf.created_at, '${tz}') BETWEEN @start AND @end
        ${fulO}
    ),
    returns_t AS (
      SELECT SUM(IFNULL(refund_amount, 0)) AS refund_value
      FROM refunds_raw
    ),
    ads AS (
      SELECT
        SUM(${spendExpr}) AS spend,
        SUM(IF(LOWER(ad.channel) LIKE 'meta%', ${spendExpr}, 0)) AS meta_spend,
        SUM(IF(LOWER(ad.channel) LIKE 'google%', ad.spend, 0)) AS google_spend,
        -- Cassia 2026-06-17: split pre-order p/ atribuir spend por origem (produzido vs estoque)
        SUM(IF(LOWER(ad.channel) LIKE 'meta%' AND REGEXP_CONTAINS(LOWER(IFNULL(ad.campaign_name,'')), r'${PREORDER_CAMPAIGN_REGEX}'), ${spendExpr}, 0)) AS meta_spend_preorder,
        SUM(IF(LOWER(ad.channel) LIKE 'google%' AND REGEXP_CONTAINS(LOWER(IFNULL(ad.campaign_name,'')), r'${PREORDER_CAMPAIGN_REGEX}'), ad.spend, 0)) AS google_spend_preorder,
        SUM(ad.impressions) AS impressions,
        SUM(ad.clicks) AS clicks,
        SUM(ad.conversions) AS pixel_purchases
      FROM \`larroude-data-prod.gold.all_channels_daily\` ad
      ${fxJoinSql}
      WHERE LOWER(ad.market) = @market_lower
        AND ad.date BETWEEN @start AND @end
    ),
    first_order_per_customer AS (
      SELECT JSON_VALUE(customer, '$.id') AS cust_id,
             MIN(DATE(created_at, '${tz}')) AS first_dt
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE customer IS NOT NULL
        AND ${ORDER_FILTERS}
      GROUP BY cust_id
    ),
    customer_split AS (
      SELECT
        COUNTIF(DATE(o.created_at, '${tz}') = fo.first_dt) AS new_customer_orders,
        SUM(IF(DATE(o.created_at, '${tz}') = fo.first_dt, CAST(o.total_price AS NUMERIC), 0)) AS new_customer_revenue
      FROM \`larroude-data-prod.${dataset}.orders\` o
      JOIN first_order_per_customer fo ON JSON_VALUE(o.customer, '$.id') = fo.cust_id
      WHERE DATE(o.created_at, '${tz}') BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided','pending','expired','authorized')
        ${dtcCoreFilters(market, 'o')}
        ${fulO}
    )
    SELECT
      s.gross_sales,
      s.discounts,
      s.order_revenue,
      (s.order_revenue - IFNULL(r.refund_value, 0)) AS total_sales,
      s.orders,
      u.units,
      SAFE_DIVIDE(s.order_revenue, NULLIF(s.orders, 0)) AS aov,
      a.spend,
      a.meta_spend,
      a.google_spend,
      a.meta_spend_preorder,
      a.google_spend_preorder,
      a.impressions,
      a.clicks,
      SAFE_DIVIDE(s.gross_sales, NULLIF(a.spend, 0)) AS roas_gross,
      SAFE_DIVIDE(s.order_revenue, NULLIF(a.spend, 0)) AS roas_order,
      SAFE_DIVIDE(s.order_revenue - IFNULL(r.refund_value, 0), NULLIF(a.spend, 0)) AS roas_total,
      cs.new_customer_orders AS new_customers,
      SAFE_DIVIDE(a.spend, NULLIF(cs.new_customer_orders, 0)) AS cac,
      cs.new_customer_revenue
    FROM sales s, units_t u, returns_t r, ads a, customer_split cs
  `;
}

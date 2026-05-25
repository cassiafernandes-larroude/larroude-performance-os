import type { Market } from "@/types/metric";

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
export function aggregatedKpisSQL(market: Market) {
  const dataset = DATASET[market];
  const tz = TZ[market];

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

  // Filtro B2B/wholesale (US e BR): exclui orders de clientes B2B ou orders tagueadas
  const B2B_FILTER = `
    AND (
      JSON_VALUE(customer, '$.tags') IS NULL
      OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(customer, '$.tags')), r'b2b|wholesale')
    )
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(tags, '')), r'b2b|wholesale')
  `;

  // Filtro PIX nao pago (so BR): exclui orders com gateway PIX em status pending/expired
  const PIX_FILTER = market === "BR"
    ? `
    AND NOT (
      LOWER(IFNULL(financial_status, '')) IN ('pending', 'expired', 'authorized')
      AND (
        LOWER(IFNULL(gateway, '')) LIKE '%pix%'
        OR LOWER(IFNULL(payment_gateway_names, '')) LIKE '%pix%'
      )
    )
  `
    : "";

  // Combinacao dos filtros padrao para CTEs sobre orders
  const ORDER_FILTERS = `financial_status NOT IN ('voided','refunded') ${B2B_FILTER} ${PIX_FILTER}`;

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
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided','refunded')
        AND (
          JSON_VALUE(o.customer, '$.tags') IS NULL
          OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'b2b|wholesale')
        )
        AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'b2b|wholesale')
        ${market === "BR" ? `
        AND NOT (
          LOWER(IFNULL(o.financial_status, '')) IN ('pending', 'expired', 'authorized')
          AND (
            LOWER(IFNULL(o.gateway, '')) LIKE '%pix%'
            OR LOWER(IFNULL(o.payment_gateway_names, '')) LIKE '%pix%'
          )
        )
        ` : ""}
    ),
    refunds_raw AS (
      SELECT
        DATE(created_at, '${tz}') AS d,
        (SELECT SUM(CAST(JSON_VALUE(t,'$.amount') AS NUMERIC))
         FROM UNNEST(JSON_QUERY_ARRAY(transactions)) t
         WHERE JSON_VALUE(t,'$.kind') = 'refund') AS refund_amount
      FROM \`larroude-data-prod.${dataset}.order_refunds\`
      WHERE DATE(created_at, '${tz}') BETWEEN @start AND @end
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
        COUNTIF(DATE(o.created_at) = fo.first_dt) AS new_customer_orders,
        SUM(IF(DATE(o.created_at) = fo.first_dt, CAST(o.total_price AS NUMERIC), 0)) AS new_customer_revenue
      FROM \`larroude-data-prod.${dataset}.orders\` o
      JOIN first_order_per_customer fo ON JSON_VALUE(o.customer, '$.id') = fo.cust_id
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided','refunded')
        AND (
          JSON_VALUE(o.customer, '$.tags') IS NULL
          OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'b2b|wholesale')
        )
        AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'b2b|wholesale')
        ${market === "BR" ? `
        AND NOT (
          LOWER(IFNULL(o.financial_status, '')) IN ('pending', 'expired', 'authorized')
          AND (
            LOWER(IFNULL(o.gateway, '')) LIKE '%pix%'
            OR LOWER(IFNULL(o.payment_gateway_names, '')) LIKE '%pix%'
          )
        )
        ` : ""}
    )
    SELECT
      s.gross_sales,
      s.discounts,
      s.order_revenue,
      (s.order_revenue - IFNULL(r.refund_value, 0)) AS total_sales,
      s.orders,
      SAFE_DIVIDE(s.order_revenue, NULLIF(s.orders, 0)) AS aov,
      a.spend,
      a.meta_spend,
      a.google_spend,
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

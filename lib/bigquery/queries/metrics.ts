import type { Market } from "@/types/metric";

const TABLE: Record<Market, string> = {
  US: "larroude-data-platform.shopify_us.orders",
  BR: "larroude-data-platform.shopify_br.orders",
};

// Query de orders + new customers via CTE first_order_date (Shopify Reports compatible)
export function ordersAggregateSQL(market: Market) {
  return `
    WITH first_order AS (
      SELECT
        JSON_EXTRACT_SCALAR(customer, '$.id') AS customer_id,
        MIN(DATE(created_at)) AS first_date
      FROM \`${TABLE[market]}\`
      WHERE cancelled_at IS NULL
        AND test = FALSE
        AND customer IS NOT NULL
      GROUP BY 1
    ),
    period AS (
      SELECT
        o.id,
        o.total_line_items_price,
        o.total_discounts,
        o.total_price,
        JSON_EXTRACT_SCALAR(o.customer, '$.id') AS customer_id,
        DATE(o.created_at) AS order_date
      FROM \`${TABLE[market]}\` o
      WHERE DATE(o.created_at) BETWEEN @from AND @to
        AND o.cancelled_at IS NULL
        AND o.test = FALSE
    )
    SELECT
      COUNT(DISTINCT p.id) AS orders,
      SUM(p.total_line_items_price - COALESCE(p.total_discounts, 0)) AS gross_sales,
      SUM(p.total_price) AS total_sales,
      COUNT(DISTINCT IF(f.first_date = p.order_date, p.customer_id, NULL)) AS new_customers,
      SAFE_DIVIDE(SUM(p.total_price), COUNT(DISTINCT p.id)) AS aov
    FROM period p
    LEFT JOIN first_order f ON p.customer_id = f.customer_id
  `;
}

// Query de ads spend — channel (não platform), market lowercase
export function adsSpendSQL(market: Market) {
  return `
    SELECT
      SUM(IF(channel = 'meta_ads', spend, 0)) AS meta_spend,
      SUM(IF(channel = 'google_ads', spend, 0)) AS google_spend,
      SUM(spend) AS total_spend
    FROM \`larroude-data-platform.gold_marketing.fct_ads_spend_daily\`
    WHERE LOWER(market) = LOWER(@market)
      AND DATE(date) BETWEEN @from AND @to
  `;
}

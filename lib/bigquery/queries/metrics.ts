import type { Market } from "@/types/metric";

const TABLE: Record<Market, string> = {
  US: "larroude-data-platform.shopify_us.orders",
  BR: "larroude-data-platform.shopify_br.orders",
};

export function ordersAggregateSQL(market: Market) {
  return `
    SELECT
      COUNT(DISTINCT id) AS orders,
      SUM(total_line_items_price - total_discounts) AS gross_sales,
      SUM(total_price) AS total_sales,
      COUNTIF(customer.numberOfOrders = 1) AS new_customers,
      SUM(total_price) / NULLIF(COUNT(DISTINCT id), 0) AS aov
    FROM \`${TABLE[market]}\`
    WHERE DATE(created_at) BETWEEN @from AND @to
      AND cancelled_at IS NULL
      AND test = FALSE
  `;
}

export function adsSpendSQL(market: Market) {
  return `
    SELECT
      SUM(IF(platform = 'meta', spend, 0)) AS meta_spend,
      SUM(IF(platform = 'google', spend, 0)) AS google_spend,
      SUM(spend) AS total_spend
    FROM \`larroude-data-platform.gold_marketing.fct_ads_spend_daily\`
    WHERE market = @market
      AND DATE(date) BETWEEN @from AND @to
  `;
}

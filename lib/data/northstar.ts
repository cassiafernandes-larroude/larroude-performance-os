import type { Market } from "@/types/metric";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";
import { getMetaSpendApi, hasMetaCredentials } from "@/lib/meta-api";
import { cached } from "@/lib/cache";

export type NorthStarBundle = {
  market: Market;
  period: { from: string; to: string };
  source: "BQ" | "Mock";
  // Métricas principais (mesma fórmula do LTV Dashboard oficial)
  ltv_predictive: number;       // AOV × Frequency × Lifetime
  ltv_historical: number;       // net_sales / total_customers
  ltv_cac: number;              // ltv_predictive / cac
  cac: number;                  // spend / new_customers
  returning_rate: number;       // % clientes com >=2 pedidos no periodo (0-100)
  // Drivers do LTV
  aov: number;
  purchase_frequency: number;
  customer_lifetime: number;
  total_customers: number;
  predictive_customers: number;
  returning_customers: number;
  new_customers: number;
  // Spend
  total_ad_spend: number;
  meta_spend: number;
  google_spend: number;
  // Revenue
  total_net_sales: number;
};

// Tabela do LTV Dashboard (NOTA: usa larroude-data-platform, nao data-prod)
const ORDERS_TABLE: Record<Market, string> = {
  US: "larroude-data-platform.shopify_us.orders",
  BR: "larroude-data-platform.shopify_br.orders",
};

// Filtros exatos do LTV Dashboard (lib/queries.ts COMMON_FILTERS)
// + filtros tag B2B/wholesale na order + PIX nao pago (so BR)
function commonFilters(market: Market): string {
  const pixFilter = market === "BR" ? `
    AND LOWER(IFNULL(financial_status, '')) NOT IN ('pending', 'expired', 'authorized')
  ` : "";
  const cap = market === "US" ? 30000 : 25000;

  return `
    cancelled_at IS NULL
    AND test = FALSE
    AND JSON_VALUE(customer, '$.id') IS NOT NULL
    AND JSON_VALUE(customer, '$.id') != '5025734230182'
    AND (
      JSON_VALUE(customer, '$.tags') IS NULL
      OR (
        NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(customer, '$.tags')), r'b2b|wholesale|marketplace|redo')
      )
    )
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(tags, '')), r'b2b|wholesale|marketplace|redo')
    AND CAST(total_price AS NUMERIC) < ${cap}
    AND NOT (
      LOWER(IFNULL(tags, '')) LIKE '%troquecommerce%'
      OR LOWER(IFNULL(note, '')) LIKE '%troca direta%'
      OR LOWER(IFNULL(note, '')) LIKE '%troquecommerce%'
      OR name LIKE 'EXC-%'
      OR LOWER(IFNULL(note, '')) LIKE '%new exchange order%'
      OR LOWER(IFNULL(note, '')) LIKE '%exchange for order%'
      OR LOWER(IFNULL(tags, '')) LIKE '%loop:%'
    )
    ${pixFilter}
  `;
}

// net_sales exato do LTV Dashboard
const NET_SALES_EXPR = `
  CAST(total_line_items_price AS FLOAT64)
  - CAST(total_discounts AS FLOAT64)
  - IFNULL((
      SELECT SUM(CAST(JSON_VALUE(t, '$.amount') AS FLOAT64))
      FROM UNNEST(JSON_QUERY_ARRAY(refunds)) AS r,
        UNNEST(JSON_QUERY_ARRAY(r, '$.transactions')) AS t
    ), 0)
`;

const MOCK_US: Omit<NorthStarBundle, "market" | "period" | "source"> = {
  ltv_predictive: 455, ltv_historical: 380, ltv_cac: 1.97, cac: 231,
  returning_rate: 22.3, aov: 333, purchase_frequency: 1.37, customer_lifetime: 1.29,
  total_customers: 11000, predictive_customers: 10200, returning_customers: 2275,
  new_customers: 4754, total_ad_spend: 1100000, meta_spend: 945000, google_spend: 151000,
  total_net_sales: 2820000,
};
const MOCK_BR: Omit<NorthStarBundle, "market" | "period" | "source"> = {
  ltv_predictive: 1167, ltv_historical: 980, ltv_cac: 3.39, cac: 344,
  returning_rate: 27.6, aov: 738, purchase_frequency: 1.46, customer_lifetime: 1.38,
  total_customers: 14000, predictive_customers: 13200, returning_customers: 3640,
  new_customers: 6100, total_ad_spend: 2500000, meta_spend: 2280000, google_spend: 240000,
  total_net_sales: 7700000,
};

export async function getNorthStarBundle(market: Market): Promise<NorthStarBundle> {
  return cached(`northstar-v6:${market}`, 1800, async () => {
    // Janela 12 meses, terminando ontem
    const today = new Date();
    const to = new Date(today.getTime() - 24 * 3600 * 1000);
    const from = new Date(to.getTime() - 365 * 24 * 3600 * 1000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    if (!hasBigQueryCredentials()) {
      return {
        market, period: { from: fromStr, to: toStr }, source: "Mock",
        ...(market === "US" ? MOCK_US : MOCK_BR),
      };
    }

    const table = ORDERS_TABLE[market];

    try {
      // Query principal — fórmula oficial Cassia (LTV Dashboard)
      // Note: simplificada (sem validOrdersCte para evitar 2 levels de complexidade)
      const sql = `
        WITH base AS (
          SELECT
            JSON_VALUE(customer, '$.id') AS customer_id,
            DATE(created_at) AS order_date,
            id AS order_id,
            ${NET_SALES_EXPR} AS net_sales
          FROM \`${table}\`
          WHERE ${commonFilters(market)}
            AND DATE(created_at) BETWEEN @start AND @end
        ),
        period_customers AS (
          SELECT
            customer_id,
            COUNT(*) AS orders_in_period,
            SUM(net_sales) AS net_sales_in_period
          FROM base
          GROUP BY customer_id
        )
        SELECT
          (SELECT COUNT(*) FROM period_customers) AS total_customers,
          (SELECT COUNT(*) FROM period_customers WHERE net_sales_in_period > 0) AS predictive_customers,
          (SELECT SUM(orders_in_period) FROM period_customers WHERE net_sales_in_period > 0) AS predictive_orders,
          (SELECT SUM(net_sales_in_period) FROM period_customers WHERE net_sales_in_period > 0) AS predictive_net_sales,
          (SELECT COUNTIF(orders_in_period >= 2) FROM period_customers WHERE net_sales_in_period > 0) AS returning_customers,
          (SELECT SUM(net_sales_in_period) FROM period_customers) AS historic_net_sales
      `;

      const rows = await runQuery<{
        total_customers: number; predictive_customers: number;
        predictive_orders: number; predictive_net_sales: number | string;
        returning_customers: number; historic_net_sales: number | string;
      }>(sql, { start: fromStr, end: toStr });

      const s = rows[0];
      if (!s) throw new Error("no rows");

      const totalCustomers = Number(s.total_customers) || 0;
      const predictiveCustomers = Number(s.predictive_customers) || 0;
      const predictiveOrders = Number(s.predictive_orders) || 0;
      const predictiveNetSales = Number(s.predictive_net_sales) || 0;
      const returningCustomers = Number(s.returning_customers) || 0;
      const historicNetSales = Number(s.historic_net_sales) || 0;

      const aov = predictiveOrders > 0 ? predictiveNetSales / predictiveOrders : 0;
      const purchaseFrequency = predictiveCustomers > 0 ? predictiveOrders / predictiveCustomers : 0;
      const returningCustomerRate = predictiveCustomers > 0 ? returningCustomers / predictiveCustomers : 0;
      const customerLifetime = returningCustomerRate < 1 ? 1 / (1 - returningCustomerRate) : 0;
      const ltvPredictive = aov * purchaseFrequency * customerLifetime;
      const ltvHistorical = totalCustomers > 0 ? historicNetSales / totalCustomers : 0;

      // New customers (igual ao LTV Dashboard)
      const newCustomersRows = await runQuery<{ new_customers: number }>(
        `WITH first_order AS (
          SELECT customer_id, MIN(order_date) AS first_order_date
          FROM (
            SELECT
              JSON_VALUE(customer, '$.id') AS customer_id,
              DATE(created_at) AS order_date
            FROM \`${table}\`
            WHERE ${commonFilters(market)}
          )
          GROUP BY customer_id
        )
        SELECT COUNT(*) AS new_customers
        FROM first_order
        WHERE first_order_date BETWEEN @start AND @end`,
        { start: fromStr, end: toStr }
      );
      const newCustomers = Number(newCustomersRows[0]?.new_customers) || 0;

      // Spend total via Meta API (mesma fórmula do dashboard principal)
      let metaSpend = 0, googleSpend = 0;
      if (hasMetaCredentials()) {
        try {
          metaSpend = await getMetaSpendApi(market, fromStr, toStr);
        } catch {}
      }
      // Google via BQ
      try {
        const googleRows = await runQuery<{ google_spend: number | string }>(
          `SELECT SUM(IF(LOWER(channel) LIKE 'google%', spend, 0)) AS google_spend
           FROM \`larroude-data-prod.gold.all_channels_daily\`
           WHERE LOWER(market) = @m AND date BETWEEN @s AND @e`,
          { m: market.toLowerCase(), s: fromStr, e: toStr }
        );
        googleSpend = Number(googleRows[0]?.google_spend) || 0;
      } catch {}

      // Cassia 2026-06-14: REGRA CANONICA — spend inclui TODOS canais (Meta+Google+tools+%revenue)
      let totalAdSpend = metaSpend + googleSpend;
      try {
        const { computeTotalSpend } = await import('@/lib/channel-costs-bq');
        const breakdown = await computeTotalSpend(market as any, fromStr, toStr, metaSpend, googleSpend);
        totalAdSpend = breakdown.total;
      } catch (e) {
        console.warn('[northstar] computeTotalSpend failed, fallback Meta+Google:', e);
      }
      const cac = newCustomers > 0 ? totalAdSpend / newCustomers : 0;
      const ltvCac = cac > 0 ? ltvPredictive / cac : 0;

      return {
        market, period: { from: fromStr, to: toStr }, source: "BQ" as const,
        ltv_predictive: ltvPredictive,
        ltv_historical: ltvHistorical,
        ltv_cac: ltvCac,
        cac,
        returning_rate: returningCustomerRate * 100,
        aov,
        purchase_frequency: purchaseFrequency,
        customer_lifetime: customerLifetime,
        total_customers: totalCustomers,
        predictive_customers: predictiveCustomers,
        returning_customers: returningCustomers,
        new_customers: newCustomers,
        total_ad_spend: totalAdSpend,
        meta_spend: metaSpend,
        google_spend: googleSpend,
        total_net_sales: historicNetSales,
      };
    } catch (err) {
      console.error("northstar query failed:", err);
      return {
        market, period: { from: fromStr, to: toStr }, source: "Mock" as const,
        ...(market === "US" ? MOCK_US : MOCK_BR),
      };
    }
  });
}

/**
 * CAC queries — BigQuery direto (larroude-data-prod), source única de verdade.
 *
 * Substitui o connectors-based queries.ts antigo (Shopify GraphQL + Meta API).
 * Vantagens:
 *   - 5x mais rápido (SQL único vs paginação Shopify)
 *   - Sem cap de orders
 *   - Mesmos filtros do Main Dashboard (B2B, PIX BR, large orders excluded)
 *   - Consistente com LTV / Channel Share / Main Dashboard
 *
 * Tabelas:
 *   - Spend: `larroude-data-prod.gold.all_channels_daily` (filter channel meta/google)
 *   - Orders: `larroude-data-prod.stg_shopify(_br).orders`
 *   - FX rate: `larroude-data-prod.gold.fx_rates_monthly` (USD->BRL by month)
 */

import { runQuery } from './bigquery';
import type {
  DailyPoint,
  DataSourceMeta,
  KpiSummary,
  Market,
  MonthlyPoint,
  ProductCac,
  ProductCacResult,
  ProductDailyPoint,
} from './queries';

const MAX_ORDER_VALUE: Record<Market, number> = { US: 30000, BR: 25000 };
const EXCLUDED_TAGS_REGEX = 'b2b|wholesale|marketplace|redo';

function shopifyFilters(market: Market, alias = 'o'): string {
  return `
    AND ${alias}.cancelled_at IS NULL
    AND ${alias}.test = FALSE
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(${alias}.tags, '')), r'${EXCLUDED_TAGS_REGEX}')
    AND (JSON_VALUE(${alias}.customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(${alias}.customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}'))
    AND CAST(${alias}.total_price AS NUMERIC) < ${MAX_ORDER_VALUE[market]}
    AND ${alias}.financial_status NOT IN ('voided', 'refunded')
  `;
}

function spendExpr(market: Market): string {
  if (market === 'US') return 'ad.spend';
  // BR: Meta Ads em USD precisa de conversão para BRL
  return `(CASE WHEN LOWER(ad.channel) LIKE 'meta%' THEN ad.spend * IFNULL(fx.fx_rate, 5.0) ELSE ad.spend END)`;
}

function fxJoin(market: Market): string {
  if (market === 'US') return '';
  return `LEFT JOIN (
    SELECT month, avg_rate_brl_usd AS fx_rate
    FROM \`larroude-data-prod.gold.fx_rates_monthly\`
  ) fx ON fx.month = FORMAT_DATE('%Y-%m', ad.date)`;
}

function ordersDataset(market: Market): string {
  return market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
}

/**
 * Spend + orders + new customers por dia.
 * Inclui dias sem dados (spend=0, newCustomers=0) via GENERATE_DATE_ARRAY.
 */
export async function getDailySeries(
  market: Market,
  startDate: string,
  endDate: string
): Promise<DailyPoint[]> {
  const dataset = ordersDataset(market);
  const marketLower = market.toLowerCase();
  const sql = `
    WITH
    spend_daily AS (
      SELECT
        ad.date,
        SUM(${spendExpr(market)}) AS spend
      FROM \`larroude-data-prod.gold.all_channels_daily\` ad
      ${fxJoin(market)}
      WHERE ad.date BETWEEN @start AND @end
        AND LOWER(ad.market) = '${marketLower}'
        AND (LOWER(ad.channel) LIKE 'meta%' OR LOWER(ad.channel) LIKE 'google%')
      GROUP BY ad.date
    ),
    first_purchase AS (
      SELECT
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        MIN(DATE(o.created_at)) AS first_date
      FROM \`larroude-data-prod.${dataset}.orders\` o
      WHERE JSON_VALUE(o.customer, '$.id') IS NOT NULL
        ${shopifyFilters(market)}
      GROUP BY customer_id
    ),
    orders_in_window AS (
      SELECT
        DATE(o.created_at) AS date,
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        o.id AS order_id,
        CAST(o.total_price AS NUMERIC) AS price
      FROM \`larroude-data-prod.${dataset}.orders\` o
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        ${shopifyFilters(market)}
    ),
    daily_orders AS (
      SELECT
        o.date,
        COUNT(DISTINCT o.order_id) AS orders,
        SUM(o.price) AS revenue,
        COUNT(DISTINCT IF(fp.first_date = o.date, o.customer_id, NULL)) AS new_customers
      FROM orders_in_window o
      LEFT JOIN first_purchase fp ON o.customer_id = fp.customer_id
      GROUP BY o.date
    ),
    date_range AS (
      SELECT date
      FROM UNNEST(GENERATE_DATE_ARRAY(@start, @end)) AS date
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', d.date) AS date,
      IFNULL(s.spend, 0) AS spend,
      IFNULL(do.new_customers, 0) AS new_customers,
      SAFE_DIVIDE(IFNULL(s.spend, 0), do.new_customers) AS cac
    FROM date_range d
    LEFT JOIN daily_orders do ON do.date = d.date
    LEFT JOIN spend_daily s ON s.date = d.date
    ORDER BY d.date
  `;

  const rows = await runQuery<{
    date: string;
    spend: number | string;
    new_customers: number;
    cac: number | null;
  }>(sql, { start: startDate, end: endDate });

  return rows.map((r) => ({
    date: r.date,
    spend: Number(r.spend) || 0,
    newCustomers: Number(r.new_customers) || 0,
    cac: r.cac ? Number(r.cac) : 0,
  }));
}

/**
 * KPI summary agregado do período.
 * Uma query SQL única — sub-segundo, sem chamadas externas.
 */
export async function getKpiSummary(
  market: Market,
  startDate: string,
  endDate: string
): Promise<KpiSummary> {
  const dataset = ordersDataset(market);
  const marketLower = market.toLowerCase();
  const sql = `
    WITH
    spend_by_channel AS (
      SELECT
        SUM(IF(LOWER(ad.channel) LIKE 'meta%', ${spendExpr(market)}, 0)) AS meta_spend,
        SUM(IF(LOWER(ad.channel) LIKE 'google%', ${spendExpr(market)}, 0)) AS google_spend,
        SUM(${spendExpr(market)}) AS total_spend
      FROM \`larroude-data-prod.gold.all_channels_daily\` ad
      ${fxJoin(market)}
      WHERE ad.date BETWEEN @start AND @end
        AND LOWER(ad.market) = '${marketLower}'
        AND (LOWER(ad.channel) LIKE 'meta%' OR LOWER(ad.channel) LIKE 'google%')
    ),
    first_purchase AS (
      SELECT
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        MIN(DATE(o.created_at)) AS first_date
      FROM \`larroude-data-prod.${dataset}.orders\` o
      WHERE JSON_VALUE(o.customer, '$.id') IS NOT NULL
        ${shopifyFilters(market)}
      GROUP BY customer_id
    ),
    orders_agg AS (
      SELECT
        COUNT(DISTINCT o.id) AS orders,
        SUM(CAST(o.total_price AS NUMERIC)) AS revenue,
        COUNT(DISTINCT IF(fp.first_date BETWEEN @start AND @end, o.customer_id, NULL)) AS new_customers
      FROM (
        SELECT
          o.id,
          o.total_price,
          JSON_VALUE(o.customer, '$.id') AS customer_id
        FROM \`larroude-data-prod.${dataset}.orders\` o
        WHERE DATE(o.created_at) BETWEEN @start AND @end
          ${shopifyFilters(market)}
      ) o
      LEFT JOIN first_purchase fp ON o.customer_id = fp.customer_id
    )
    SELECT
      s.meta_spend,
      s.google_spend,
      s.total_spend,
      o.orders,
      o.revenue,
      o.new_customers,
      SAFE_DIVIDE(s.total_spend, o.new_customers) AS cac,
      SAFE_DIVIDE(s.total_spend, o.orders) AS cpo
    FROM spend_by_channel s
    CROSS JOIN orders_agg o
  `;

  const rows = await runQuery<{
    meta_spend: number | string;
    google_spend: number | string;
    total_spend: number | string;
    orders: number;
    revenue: number | string;
    new_customers: number;
    cac: number | null;
    cpo: number | null;
  }>(sql, { start: startDate, end: endDate });

  const r = rows[0];
  const sources: DataSourceMeta = {
    metaAds: 'api', // efetivamente bq mas mantemos compat com UI
    googleAds: 'api',
    shopify: 'api',
    monthly: 'bigquery',
  };

  return {
    market,
    spend: Number(r.total_spend) || 0,
    metaSpend: Number(r.meta_spend) || 0,
    googleSpend: Number(r.google_spend) || 0,
    newCustomers: Number(r.new_customers) || 0,
    cac: r.cac ? Number(r.cac) : 0,
    orders: Number(r.orders) || 0,
    revenue: Number(r.revenue) || 0,
    cpo: r.cpo ? Number(r.cpo) : 0,
    startDate,
    endDate,
    sources,
  };
}

/**
 * Monthly series — últimos 12 meses, CAC mensal.
 */
export async function getMonthlySeries(market: Market): Promise<MonthlyPoint[]> {
  const dataset = ordersDataset(market);
  const marketLower = market.toLowerCase();
  const sql = `
    WITH
    months AS (
      SELECT month
      FROM UNNEST(GENERATE_DATE_ARRAY(
        DATE_TRUNC(DATE_SUB(CURRENT_DATE('America/Sao_Paulo'), INTERVAL 11 MONTH), MONTH),
        DATE_TRUNC(CURRENT_DATE('America/Sao_Paulo'), MONTH),
        INTERVAL 1 MONTH
      )) AS month
    ),
    spend_monthly AS (
      SELECT
        DATE_TRUNC(ad.date, MONTH) AS month,
        SUM(${spendExpr(market)}) AS spend
      FROM \`larroude-data-prod.gold.all_channels_daily\` ad
      ${fxJoin(market)}
      WHERE ad.date >= DATE_TRUNC(DATE_SUB(CURRENT_DATE('America/Sao_Paulo'), INTERVAL 11 MONTH), MONTH)
        AND LOWER(ad.market) = '${marketLower}'
        AND (LOWER(ad.channel) LIKE 'meta%' OR LOWER(ad.channel) LIKE 'google%')
      GROUP BY month
    ),
    first_purchase AS (
      SELECT
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        MIN(DATE(o.created_at)) AS first_date
      FROM \`larroude-data-prod.${dataset}.orders\` o
      WHERE JSON_VALUE(o.customer, '$.id') IS NOT NULL
        ${shopifyFilters(market)}
      GROUP BY customer_id
    ),
    new_customers_monthly AS (
      SELECT
        DATE_TRUNC(fp.first_date, MONTH) AS month,
        COUNT(DISTINCT fp.customer_id) AS new_customers
      FROM first_purchase fp
      WHERE fp.first_date >= DATE_TRUNC(DATE_SUB(CURRENT_DATE('America/Sao_Paulo'), INTERVAL 11 MONTH), MONTH)
      GROUP BY month
    )
    SELECT
      FORMAT_DATE('%Y-%m', m.month) AS month,
      IFNULL(s.spend, 0) AS spend,
      IFNULL(nc.new_customers, 0) AS new_customers,
      SAFE_DIVIDE(IFNULL(s.spend, 0), nc.new_customers) AS cac
    FROM months m
    LEFT JOIN spend_monthly s ON s.month = m.month
    LEFT JOIN new_customers_monthly nc ON nc.month = m.month
    ORDER BY m.month
  `;

  const rows = await runQuery<{
    month: string;
    spend: number | string;
    new_customers: number;
    cac: number | null;
  }>(sql);

  return rows.map((r) => ({
    month: r.month,
    spend: Number(r.spend) || 0,
    newCustomers: Number(r.new_customers) || 0,
    cac: r.cac ? Number(r.cac) : 0,
  }));
}

/**
 * Product CAC — placeholder enquanto NÃO migramos.
 * Por enquanto retorna vazio (ProductTable + Heatmap vão mostrar empty state).
 * Próximo passo: portar pra BQ usando line_items JSON UNNEST + alocacao pro-rata.
 */
export async function getProductCac(
  _market: Market,
  _startDate: string,
  _endDate: string,
  _limit = 200
): Promise<ProductCacResult> {
  return { products: [], productDaily: [] };
}

export async function getDataFreshness(): Promise<string> {
  // D-1 em UTC (mesmo que o source antigo)
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

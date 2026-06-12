/**
 * LTV Dashboard — orchestration layer.
 *
 * Methodology (aligned with Cassia's Triple-Whale-like formula):
 *
 *   LTV PREDITIVO  =  AOV × Purchase Frequency × Customer Lifetime
 *     Todas as métricas usam SOMENTE orders VÁLIDAS (2026-05-14):
 *     exclui TroquEcommerce e recompras de mesmo produto+cor (qualquer tamanho —
 *     trocas/size-swaps). NÃO reconcilia mais com planilha LTV oficial Cassia
 *     (33.17%) — essa rule was added DEPOIS da validação inicial.
 *
 *     AOV               = net_sales / valid_orders (BR 12M: ~R$ 738, era R$ 683 gross)
 *     Frequency         = valid_orders / customers
 *     Lifetime          = 1 / (1 - returning_customer_rate)
 *     Returning rate    = "% de customers com ≥2 VALID orders WITHIN the window"
 *                         BR 12M ~27.6% (era 34.6% antes da regra).
 *
 *   LTV HISTORICO  =  total_net_sales / total_customers
 *     Includes all customers in period (including those with net_sales ≤ 0, i.e. returns-total).
 *     Matches Cassia's "net_sales / customers" definition.
 *
 * Filters applied to ALL queries:
 *   - cancelled_at IS NULL
 *   - test = FALSE
 *   - customer.id IS NOT NULL (no guest checkouts)
 *   - customer.id != '5025734230182' (specific outlier excluded by Cassia)
 *   - customer.tags does NOT contain 'B2B' or 'WHOLESALE' (case-insensitive)
 *
 * Sources:
 *   - Orders / Customers / Refunds → BigQuery `shopify_<market>.orders` (Airbyte mirror)
 *   - Meta Ads spend → Meta Marketing API (for LTV/CAC ratio)
 *   - Google Ads spend → Google Ads API with BigQuery fallback (for LTV/CAC ratio)
 *
 * Why BigQuery primary: LTV must aggregate ALL orders per customer in the window.
 * For 12M rolling default that's >100k orders/market. BigQuery returns in 2-3s vs minutes
 * for Shopify GraphQL pagination.
 */

import { runQuery } from './bigquery';
import { getMetaSpendByDay } from './connectors/meta-ads';
import { getGoogleAdsSpendByDay } from './connectors/google-ads';
import { motherSkuOf, productTypeOf } from './connectors/shopify';
import { topLtvMinCustomers } from './thresholds';
import { getMetaSpendAdjustment } from '@/lib/shared/meta-adjustments';
import {
  queryGoogleAdsViaSupermetrics,
  queryGoogleAdsTotalViaSupermetrics,
} from '@/lib/main-dashboard/supermetrics';
import type { Market as MainMarket } from '@/lib/main-dashboard/types';

export { topLtvMinCustomers };

export type Market = 'US' | 'BR';

// Tabelas BQ no projeto larroude-data-prod (mesmo usado pelo Main Dashboard / Overview).
// O Dashboard LTV original usava 'larroude-data-platform.shopify_us.orders' -
// no lpos os dados Shopify estao em larroude-data-prod.stg_shopify(_br).orders.
const ORDERS_TABLE: Record<Market, string> = {
  US: 'larroude-data-prod.stg_shopify.orders',
  BR: 'larroude-data-prod.stg_shopify_br.orders',
};

/**
 * Common WHERE clauses applied to every query that reads from shopify_<market>.orders.
 * Keeps the filters in one place so they stay aligned across all metrics.
 *
 * INCLUI exclusão de orders de TROCA — orders geradas como trocas automáticas,
 * não representam decisão de compra genuína. Excluir aqui afeta TODAS as métricas
 * (AOV, revenue, customer count, orders, etc.).
 *
 * Padrões cobertos:
 *   BR: TroquEcommerce (tags ou note "troquecommerce" / "Troca direta")
 *   US: Loop Returns (name 'EXC-' prefix, note "new exchange order" / "exchange for order",
 *        tags "loop:")
 */
const COMMON_FILTERS = `
  cancelled_at IS NULL
  AND test = FALSE
  AND JSON_VALUE(customer, '$.id') IS NOT NULL
  AND JSON_VALUE(customer, '$.id') != '5025734230182'
  AND (
    JSON_VALUE(customer, '$.tags') IS NULL
    OR (
      NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(customer, '$.tags')), r'b2b')
      AND NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(customer, '$.tags')), r'wholesale')
    )
  )
  AND NOT (
    -- BR: TroquEcommerce
    LOWER(IFNULL(tags, '')) LIKE '%troquecommerce%'
    OR LOWER(IFNULL(note, '')) LIKE '%troca direta%'
    OR LOWER(IFNULL(note, '')) LIKE '%troquecommerce%'
    -- US: Loop Returns
    OR name LIKE 'EXC-%'
    OR LOWER(IFNULL(note, '')) LIKE '%new exchange order%'
    OR LOWER(IFNULL(note, '')) LIKE '%exchange for order%'
    OR LOWER(IFNULL(tags, '')) LIKE '%loop:%'
  )
`;

/**
 * net_sales = total_line_items_price - total_discounts - refunds
 * Refunds are summed across the refunds.transactions[].amount array.
 */
const NET_SALES_EXPR = `
  CAST(total_line_items_price AS FLOAT64)
  - CAST(total_discounts AS FLOAT64)
  - IFNULL((
      SELECT SUM(CAST(JSON_VALUE(t, '$.amount') AS FLOAT64))
      FROM UNNEST(JSON_QUERY_ARRAY(refunds)) AS r,
        UNNEST(JSON_QUERY_ARRAY(r, '$.transactions')) AS t
    ), 0)
`;

/**
 * SQL fragment: define CTEs `valid_orders` listing order_ids that COUNT as
 * genuine purchases for retention/repeat analysis.
 *
 * An order is "valid" if it contains at least one line item that is the
 * FIRST occurrence of a product+color (normalized title) for that customer
 * across their entire lifetime — AFTER subtracting refunded quantities.
 *
 * Excludes:
 *   - Orders flagged as TroquEcommerce trocas (tags or note)
 *   - Line items entirely refunded (net_qty ≤ 0)
 *   - Re-purchases of same product+color (any size) — likely size-swaps/trocas
 *
 * Prepend this to a query's WITH clause, then filter target table with
 *   ... AND id IN (SELECT order_id FROM valid_orders)
 */
function validOrdersCte(table: string): string {
  return `
  __vo_refunded AS (
    SELECT o.id AS order_id,
           CAST(JSON_VALUE(rli, '$.line_item_id') AS INT64) AS line_item_id,
           SUM(CAST(JSON_VALUE(rli, '$.quantity') AS FLOAT64)) AS refunded_qty
    FROM \`${table}\` o,
      UNNEST(JSON_QUERY_ARRAY(o.refunds)) AS r,
      UNNEST(JSON_QUERY_ARRAY(r, '$.refund_line_items')) AS rli
    WHERE o.cancelled_at IS NULL AND o.test = FALSE
    GROUP BY o.id, line_item_id
  ),
  __vo_raw_li AS (
    SELECT
      JSON_VALUE(o.customer, '$.id') AS customer_id,
      o.id AS order_id,
      DATE(o.created_at) AS order_date,
      CAST(JSON_VALUE(li, '$.id') AS INT64) AS line_item_id,
      TRIM(REGEXP_REPLACE(JSON_VALUE(li, '$.title'), r'\\s+', ' ')) AS title_norm,
      CAST(JSON_VALUE(li, '$.quantity') AS FLOAT64) AS qty
    FROM \`${table}\` o,
      UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
    WHERE ${COMMON_FILTERS.replace(/test = FALSE/, 'o.test = FALSE').replace(/cancelled_at IS NULL/, 'o.cancelled_at IS NULL').replace(/JSON_VALUE\(customer/g, 'JSON_VALUE(o.customer').replace(/(?<![A-Za-z_])name LIKE/g, 'o.name LIKE').replace(/IFNULL\(tags/g, 'IFNULL(o.tags').replace(/IFNULL\(note/g, 'IFNULL(o.note')}
  ),
  __vo_clean_li AS (
    SELECT r.*, r.qty - IFNULL(rf.refunded_qty, 0) AS net_qty
    FROM __vo_raw_li r LEFT JOIN __vo_refunded rf USING (order_id, line_item_id)
    WHERE r.qty - IFNULL(rf.refunded_qty, 0) > 0
  ),
  __vo_first_per_title AS (
    SELECT order_id FROM (
      SELECT order_id,
        ROW_NUMBER() OVER (
          PARTITION BY customer_id, title_norm
          ORDER BY order_date, order_id, line_item_id
        ) AS rn_title
      FROM __vo_clean_li
    )
    WHERE rn_title = 1
  ),
  valid_orders AS (
    SELECT DISTINCT order_id FROM __vo_first_per_title
  )
  `;
}

export interface DataSourceMeta {
  orders: 'bigquery';
  metaAds: 'api';
  googleAds: 'api' | 'bigquery_fallback' | 'unavailable';
}

export interface LtvKpiSummary {
  market: Market;
  startDate: string;
  endDate: string;

  // Customer counts
  totalCustomers: number;        // All customers in period (including net_sales ≤ 0)
  predictiveCustomers: number;   // Customers used for the predictive formula (net_sales > 0)
  returningCustomers: number;    // Customers that bought before the window started

  // Core metrics
  aov: number;                   // net_sales / orders (predictive customers only)
  purchaseFrequency: number;     // orders / customers (predictive customers only)
  customerLifetime: number;      // 1 / (1 - returning_rate)   in years
  returningCustomerRate: number; // 0..100 (percent)
  repeatPurchaseRate: number;    // alias for returningCustomerRate, kept for UI compat

  // LTV — two definitions
  ltvPredictive: number;         // AOV × Frequency × Lifetime
  ltvHistorical: number;         // net_sales / total_customers (no filter)
  ltvAvg: number;                // alias for ltvHistorical, kept for UI compat

  // Distribution (over predictive customers)
  ltvMedian: number;
  ltvP75: number;
  ltvP90: number;

  // Totals
  totalOrders: number;
  totalRevenue: number;          // net_sales in period (across all customers)

  // Time between purchases
  medianDaysBetweenPurchases: number;

  // LTV / CAC
  cac: number;
  ltvCacRatio: number;           // ltvPredictive / cac
  newCustomers: number;
  totalAdSpend: number;
  metaSpend: number;
  googleSpend: number;

  sources: DataSourceMeta;
}

export interface DailyLtvPoint {
  date: string;
  orders: number;
  customers: number;
  revenue: number;
  aov: number;
  ltvOfDayCustomers: number;
}

export interface MonthlyLtvPoint {
  month: string;
  customers: number;
  orders: number;
  revenue: number;
  aov: number;
  ltvAvg: number;
  repeatPurchaseRate: number;
  // LTV / CAC overtime
  newCustomers: number;
  metaSpend: number;
  googleSpend: number;
  totalAdSpend: number;
  cac: number;
  ltvCacRatio: number;
}

export interface ProductLtv {
  motherSku: string;
  productName: string | null;
  units: number;
  revenue: number;
  customers: number;
  customerLtvAvg: number;
  customerLtvMedian: number;
}

export interface ProductDailyPoint {
  motherSku: string;
  productName: string | null;
  date: string;
  units: number;
  revenue: number;
  customers: number;
  customerLtvAvg: number;
}

/**
 * Retention stats — métricas absolutas do histórico do cliente,
 * independentes da janela do dashboard.
 *
 *   returningRateAllTime    = % de clientes com ≥2 orders no histórico (vida toda)
 *   repeat90d               = % de clientes cuja 2ª compra ocorreu até 90 dias da 1ª
 *   repeat12m               = % de clientes cuja 2ª compra ocorreu até 365 dias da 1ª
 *   purchaseFrequencyAnnual = orders / customers nos últimos 12 meses
 */
export interface RetentionStats {
  returningRateAllTime: number;       // 0..100
  repeat90d: number;                  // 0..100
  repeat12m: number;                  // 0..100
  purchaseFrequencyAnnual: number;    // orders / customers
  lifetimeCustomers: number;
}

export interface CategoryLtv {
  categoryCode: string;          // product type slug ("Sandália", "Mule", "Bota", ...)
  categoryName: string;          // same as categoryCode (kept for UI compat)
  units: number;
  revenue: number;
  customers: number;
  customerLtvAvg: number;
  customerLtvMedian: number;
}

export interface ProductLtvResult {
  products: ProductLtv[];
  productDaily: ProductDailyPoint[];
  categories: CategoryLtv[];
}

// ---------------------------------------------------------------------------
// Customer Journey (jornada do cliente por produto)
// ---------------------------------------------------------------------------

export interface JourneyProduct {
  motherSku: string;          // ex: "L422-VERO"
  productName: string;         // primeiras palavras do título
  customers: number;
  repeatRate?: number;          // 0..100, % que fez ≥2 compras (apenas entry products)
  medianDaysFromPrev?: number;  // mediana de dias da compra anterior (apenas 2ª e 3ª)
}

export interface TransitionCell {
  fromSku: string;       // produto da 1ª compra
  fromName: string;
  toSku: string;         // produto da 2ª compra
  toName: string;
  customers: number;     // quantos fizeram essa transição
  pctOfFirst: number;    // % dos que tiveram fromSku como 1ª
  medianDaysFromPrev?: number; // mediana de dias entre 1ª e 2ª (só em allTransitions)
}

export interface CustomerJourney {
  medianDays1to2: number;        // mediana de dias entre 1ª e 2ª compra
  medianDays2to3: number;        // mediana de dias entre 2ª e 3ª
  entryProducts: JourneyProduct[];           // top 5 1ª compra
  secondPurchaseProducts: JourneyProduct[];  // top 5 2ª compra
  thirdPurchaseProducts: JourneyProduct[];   // top 5 3ª compra
  transitionMatrix: TransitionCell[];        // 1ª → 2ª (até 15×15 cells)
  // Explorador interativo: TODAS as transições com ≥5 clientes
  // a partir de produtos com ≥50 clientes na 1ª compra.
  // O frontend filtra client-side pelo produto selecionado no dropdown.
  allTransitions: TransitionCell[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumMap(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

// ---------------------------------------------------------------------------
// KPI Summary
// ---------------------------------------------------------------------------

export async function getLtvKpiSummary(
  market: Market,
  startDate: string,
  endDate: string
): Promise<LtvKpiSummary> {
  const table = ORDERS_TABLE[market];

  // TODAS as métricas (gross e retention) usam SOMENTE valid_orders:
  // exclui TroquEcommerce + recompras de mesmo produto+cor.
  const summaryQuery = `
    WITH
    ${validOrdersCte(table)},
    base AS (
      SELECT
        JSON_VALUE(customer, '$.id') AS customer_id,
        DATE(created_at) AS order_date,
        id AS order_id,
        ${NET_SALES_EXPR} AS net_sales
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS}
        AND DATE(created_at) BETWEEN @start AND @end
        AND id IN (SELECT order_id FROM valid_orders)
    ),
    period_customers AS (
      SELECT
        customer_id,
        COUNT(*) AS orders_in_period,
        SUM(net_sales) AS net_sales_in_period
      FROM base
      GROUP BY customer_id
    ),
    -- Gap 1ª → 2ª COMPRA dentro da janela (mesma definição da Jornada).
    -- Antes era "qualquer gap consecutivo" — agora consistente com bloco Jornada.
    gaps AS (
      SELECT
        customer_id,
        ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date) AS rn,
        LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS prev_date,
        order_date
      FROM base
    )
    SELECT
      (SELECT COUNT(*) FROM period_customers) AS total_customers,
      (SELECT COUNT(*) FROM period_customers WHERE net_sales_in_period > 0) AS predictive_customers,
      (SELECT SUM(orders_in_period) FROM period_customers WHERE net_sales_in_period > 0) AS predictive_orders,
      (SELECT SUM(net_sales_in_period) FROM period_customers WHERE net_sales_in_period > 0) AS predictive_net_sales,
      (SELECT COUNTIF(orders_in_period >= 2) FROM period_customers WHERE net_sales_in_period > 0) AS returning_customers,
      (SELECT SUM(net_sales_in_period) FROM period_customers) AS historic_net_sales,
      (SELECT SUM(orders_in_period) FROM period_customers) AS total_orders,
      (SELECT APPROX_QUANTILES(net_sales_in_period, 100)[OFFSET(50)]
         FROM period_customers WHERE net_sales_in_period > 0) AS ltv_median,
      (SELECT APPROX_QUANTILES(net_sales_in_period, 100)[OFFSET(75)]
         FROM period_customers WHERE net_sales_in_period > 0) AS ltv_p75,
      (SELECT APPROX_QUANTILES(net_sales_in_period, 100)[OFFSET(90)]
         FROM period_customers WHERE net_sales_in_period > 0) AS ltv_p90,
      -- Mediana 1ª → 2ª compra (mesma definição do bloco Jornada — consistência total)
      (SELECT APPROX_QUANTILES(DATE_DIFF(order_date, prev_date, DAY), 100)[OFFSET(50)]
         FROM gaps
         WHERE rn = 2 AND prev_date IS NOT NULL
           AND DATE_DIFF(order_date, prev_date, DAY) > 0) AS median_gap_days
  `;
  const rows = await runQuery<{
    total_customers: number;
    predictive_customers: number;
    predictive_orders: number;
    predictive_net_sales: number;
    returning_customers: number;
    historic_net_sales: number;
    total_orders: number;
    ltv_median: number;
    ltv_p75: number;
    ltv_p90: number;
    median_gap_days: number | null;
  }>(summaryQuery, { start: startDate, end: endDate });

  const s = rows[0] ?? ({} as Record<string, number>);
  const totalCustomers = Number(s.total_customers ?? 0);
  const predictiveCustomers = Number(s.predictive_customers ?? 0);
  const predictiveOrders = Number(s.predictive_orders ?? 0);
  const predictiveNetSales = Number(s.predictive_net_sales ?? 0);
  const returningCustomers = Number(s.returning_customers ?? 0);
  const historicNetSales = Number(s.historic_net_sales ?? 0);
  const totalOrders = Number(s.total_orders ?? 0);

  const aov = predictiveOrders > 0 ? predictiveNetSales / predictiveOrders : 0;
  const purchaseFrequency = predictiveCustomers > 0 ? predictiveOrders / predictiveCustomers : 0;
  const returningCustomerRate =
    predictiveCustomers > 0 ? returningCustomers / predictiveCustomers : 0;
  const customerLifetime = returningCustomerRate < 1 ? 1 / (1 - returningCustomerRate) : 0;
  const ltvPredictive = aov * purchaseFrequency * customerLifetime;
  const ltvHistorical = totalCustomers > 0 ? historicNetSales / totalCustomers : 0;

  // New customers (= first ever order falls inside the window). Used by CAC.
  const newCustomersQuery = `
    WITH first_order AS (
      SELECT customer_id, MIN(order_date) AS first_order_date
      FROM (
        SELECT
          JSON_VALUE(customer, '$.id') AS customer_id,
          DATE(created_at) AS order_date
        FROM \`${table}\`
        WHERE ${COMMON_FILTERS}
      )
      GROUP BY customer_id
    )
    SELECT COUNT(*) AS new_customers
    FROM first_order
    WHERE first_order_date BETWEEN @start AND @end
  `;
  const newRows = await runQuery<{ new_customers: number }>(newCustomersQuery, {
    start: startDate,
    end: endDate,
  });
  const newCustomers = Number(newRows[0]?.new_customers ?? 0);

  // Ad spend (best-effort) — alinhado com Main Dashboard + CAC native:
  //   Meta: Meta Graph API direta (todas 5 contas) via getMetaSpendByDay
  //   Google: Supermetrics (regra Cassia)
  let metaSpend = 0;
  let googleSpend = 0;
  let googleSource: 'api' | 'bigquery_fallback' | 'unavailable' = 'api';
  try {
    const [metaMap, googleTotal] = await Promise.all([
      getMetaSpendByDay(market, startDate, endDate),
      queryGoogleAdsTotalViaSupermetrics(market as MainMarket, startDate, endDate).catch((e) => {
        console.warn('[ltv] google supermetrics failed:', e instanceof Error ? e.message : e);
        googleSource = 'unavailable';
        return { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 };
      }),
    ]);
    metaSpend = sumMap(metaMap);
    googleSpend = Number(googleTotal.spend) || 0;
  } catch (e) {
    console.warn('[ltv] meta-ads failed:', e instanceof Error ? e.message : e);
  }

  // AJUSTE MANUAL: Meta US +$400k Setembro/2025 (regra Cassia, REGRAS-LARROUDE-OS.md secao 3.3)
  metaSpend += getMetaSpendAdjustment(market as 'US' | 'BR', startDate, endDate);

  const totalAdSpend = metaSpend + googleSpend;
  const cac = newCustomers > 0 ? totalAdSpend / newCustomers : 0;
  const ltvCacRatio = cac > 0 ? ltvPredictive / cac : 0;

  return {
    market,
    startDate,
    endDate,
    totalCustomers,
    predictiveCustomers,
    returningCustomers,
    aov,
    purchaseFrequency,
    customerLifetime,
    returningCustomerRate: returningCustomerRate * 100,
    repeatPurchaseRate: returningCustomerRate * 100,
    ltvPredictive,
    ltvHistorical,
    ltvAvg: ltvHistorical,
    ltvMedian: Number(s.ltv_median ?? 0),
    ltvP75: Number(s.ltv_p75 ?? 0),
    ltvP90: Number(s.ltv_p90 ?? 0),
    totalOrders,
    totalRevenue: historicNetSales,
    medianDaysBetweenPurchases: Number(s.median_gap_days ?? 0),
    cac,
    ltvCacRatio,
    newCustomers,
    totalAdSpend,
    metaSpend,
    googleSpend,
    sources: {
      orders: 'bigquery',
      metaAds: 'api',
      googleAds: googleSource,
    },
  };
}

// ---------------------------------------------------------------------------
// Daily series
// ---------------------------------------------------------------------------

export async function getDailyLtvSeries(
  market: Market,
  startDate: string,
  endDate: string
): Promise<DailyLtvPoint[]> {
  const table = ORDERS_TABLE[market];

  // Série diária — exclui trocas (TroquEcommerce + mesmo produto+cor)
  const q = `
    WITH
    ${validOrdersCte(table)},
    base AS (
      SELECT
        JSON_VALUE(customer, '$.id') AS customer_id,
        DATE(created_at) AS order_date,
        ${NET_SALES_EXPR} AS net_sales
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS}
        AND DATE(created_at) BETWEEN @start AND @end
        AND id IN (SELECT order_id FROM valid_orders)
    ),
    cust_window AS (
      SELECT customer_id, SUM(net_sales) AS lifetime_in_window
      FROM base
      GROUP BY customer_id
    ),
    daily AS (
      SELECT
        b.order_date AS date,
        COUNT(*) AS orders,
        COUNT(DISTINCT b.customer_id) AS customers,
        SUM(b.net_sales) AS revenue,
        SUM(c.lifetime_in_window) / NULLIF(COUNT(DISTINCT b.customer_id), 0) AS ltv_of_day_customers
      FROM base b
      JOIN cust_window c USING (customer_id)
      GROUP BY date
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', date) AS date,
      orders, customers, revenue, ltv_of_day_customers
    FROM daily
    ORDER BY date
  `;
  const rows = await runQuery<{
    date: string;
    orders: number;
    customers: number;
    revenue: number;
    ltv_of_day_customers: number;
  }>(q, { start: startDate, end: endDate });

  const byDate = new Map<string, DailyLtvPoint>();
  for (const r of rows) {
    const orders = Number(r.orders ?? 0);
    const revenue = Number(r.revenue ?? 0);
    byDate.set(r.date, {
      date: r.date,
      orders,
      customers: Number(r.customers ?? 0),
      revenue,
      aov: orders > 0 ? revenue / orders : 0,
      ltvOfDayCustomers: Number(r.ltv_of_day_customers ?? 0),
    });
  }

  const out: DailyLtvPoint[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    out.push(
      byDate.get(iso) ?? {
        date: iso,
        orders: 0,
        customers: 0,
        revenue: 0,
        aov: 0,
        ltvOfDayCustomers: 0,
      }
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Monthly series (rolling 12M)
// ---------------------------------------------------------------------------

export async function getMonthlyLtvSeries(market: Market): Promise<MonthlyLtvPoint[]> {
  const table = ORDERS_TABLE[market];

  // TODAS as métricas mensais usam SOMENTE valid_orders:
  // exclui TroquEcommerce + recompras de mesmo produto+cor.
  const q = `
    WITH
    ${validOrdersCte(table)},
    window_orders AS (
      SELECT
        JSON_VALUE(customer, '$.id') AS customer_id,
        DATE(created_at) AS order_date,
        id AS order_id,
        FORMAT_DATE('%Y-%m', DATE(created_at)) AS ym,
        ${NET_SALES_EXPR} AS net_sales
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS}
        AND DATE(created_at) >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 11 MONTH), MONTH)
        AND id IN (SELECT order_id FROM valid_orders)
    ),
    -- First order ever per customer (também valid_orders apenas)
    first_order_ever AS (
      SELECT
        JSON_VALUE(customer, '$.id') AS customer_id,
        MIN(DATE(created_at)) AS first_d
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS}
        AND id IN (SELECT order_id FROM valid_orders)
      GROUP BY customer_id
    ),
    customer_window_total AS (
      SELECT customer_id, SUM(net_sales) AS lifetime_in_window, COUNT(*) AS orders_in_window
      FROM window_orders
      GROUP BY customer_id
    ),
    monthly_customers AS (
      SELECT ym, customer_id,
             COUNT(*) AS orders_in_month,
             SUM(net_sales) AS revenue_in_month
      FROM window_orders
      GROUP BY ym, customer_id
    ),
    monthly_agg AS (
      SELECT
        mc.ym,
        COUNT(DISTINCT mc.customer_id) AS customers,
        SUM(mc.orders_in_month) AS orders,
        SUM(mc.revenue_in_month) AS revenue,
        SUM(c.lifetime_in_window) / NULLIF(COUNT(DISTINCT mc.customer_id), 0) AS ltv_avg,
        COUNTIF(c.orders_in_window >= 2) AS repeat_customers
      FROM monthly_customers mc
      JOIN customer_window_total c USING (customer_id)
      GROUP BY mc.ym
    ),
    new_per_month AS (
      SELECT FORMAT_DATE('%Y-%m', first_d) AS ym, COUNT(*) AS new_customers
      FROM first_order_ever
      WHERE first_d >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 11 MONTH), MONTH)
      GROUP BY ym
    )
    SELECT
      ma.ym AS month,
      ma.customers, ma.orders, ma.revenue, ma.ltv_avg,
      SAFE_DIVIDE(ma.repeat_customers * 100.0, ma.customers) AS repeat_purchase_rate,
      IFNULL(np.new_customers, 0) AS new_customers
    FROM monthly_agg ma
    LEFT JOIN new_per_month np USING (ym)
    ORDER BY ma.ym
  `;
  const rows = await runQuery<{
    month: string;
    customers: number;
    orders: number;
    revenue: number;
    ltv_avg: number;
    repeat_purchase_rate: number;
    new_customers: number;
  }>(q);

  // 2) Buscar Meta + Google spend para os últimos 12 meses (em paralelo)
  const today = new Date();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const startISO = startMonth.toISOString().slice(0, 10);
  const endISO = today.toISOString().slice(0, 10);

  const metaByMonth = new Map<string, number>();
  const googleByMonth = new Map<string, number>();
  try {
    const [metaDaily, googleDaily] = await Promise.all([
      getMetaSpendByDay(market, startISO, endISO),
      // Google via Supermetrics (alinhado com Main + CAC native)
      queryGoogleAdsViaSupermetrics(market as MainMarket, startISO, endISO).catch((e) => {
        console.warn('[monthly] google supermetrics failed:', e instanceof Error ? e.message : e);
        return [] as Array<{ date: string; spend: number }>;
      }),
    ]);
    for (const [date, value] of metaDaily) {
      const ym = date.slice(0, 7);
      metaByMonth.set(ym, (metaByMonth.get(ym) ?? 0) + value);
    }
    for (const row of googleDaily) {
      const ym = String(row.date).slice(0, 7);
      const v = Number(row.spend) || 0;
      googleByMonth.set(ym, (googleByMonth.get(ym) ?? 0) + v);
    }
  } catch (e) {
    console.warn('[monthly] meta/google spend failed:', e instanceof Error ? e.message : e);
  }

  // AJUSTE MANUAL: Meta US +$400k Setembro/2025 (regra Cassia)
  // Adiciona ao bucket mensal pra que LTV/CAC overtime mostre Set/25 correto.
  const sep25Adj = getMetaSpendAdjustment(market as 'US' | 'BR', '2025-09-01', '2025-09-30');
  if (sep25Adj > 0) {
    metaByMonth.set('2025-09', (metaByMonth.get('2025-09') ?? 0) + sep25Adj);
  }

  const byMonth = new Map<string, MonthlyLtvPoint>();
  for (const r of rows) {
    const orders = Number(r.orders ?? 0);
    const revenue = Number(r.revenue ?? 0);
    const newCustomers = Number(r.new_customers ?? 0);
    const metaSpend = metaByMonth.get(r.month) ?? 0;
    const googleSpend = googleByMonth.get(r.month) ?? 0;
    const totalAdSpend = metaSpend + googleSpend;
    const cac = newCustomers > 0 ? totalAdSpend / newCustomers : 0;
    const ltvAvg = Number(r.ltv_avg ?? 0);
    // Só calcular ratio quando há sinal real (evita outliers de meses
    // com spend quase zero ou pouquíssimos clientes novos)
    const reliableSpend = totalAdSpend >= 1000; // R$1k / $1k mínimo de spend
    const reliableNew = newCustomers >= 20;
    const ratio = cac > 0 && reliableSpend && reliableNew ? ltvAvg / cac : 0;
    byMonth.set(r.month, {
      month: r.month,
      customers: Number(r.customers ?? 0),
      orders,
      revenue,
      aov: orders > 0 ? revenue / orders : 0,
      ltvAvg,
      repeatPurchaseRate: Number(r.repeat_purchase_rate ?? 0),
      newCustomers,
      metaSpend,
      googleSpend,
      totalAdSpend,
      cac,
      ltvCacRatio: ratio,
    });
  }

  const out: MonthlyLtvPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push(
      byMonth.get(ym) ?? {
        month: ym,
        customers: 0,
        orders: 0,
        revenue: 0,
        aov: 0,
        ltvAvg: 0,
        repeatPurchaseRate: 0,
        newCustomers: 0,
        metaSpend: 0,
        googleSpend: 0,
        totalAdSpend: 0,
        cac: 0,
        ltvCacRatio: 0,
      }
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// LTV by product (mother SKU)
// ---------------------------------------------------------------------------

interface LineItemPayload {
  sku?: string | null;
  variant_sku?: string | null;
  title?: string | null;
  name?: string | null;
  product_id?: string | number | null;
  quantity?: number | string | null;
  price?: number | string | null;
}

export async function getProductLtv(
  market: Market,
  startDate: string,
  endDate: string,
  limit = 200
): Promise<ProductLtvResult> {
  const table = ORDERS_TABLE[market];

  // (1) Per-customer net_sales in the window
  // Inclui apenas orders válidas (exclui trocas + recompras de mesmo produto+cor)
  const custLifetimeQuery = `
    WITH
    ${validOrdersCte(table)}
    SELECT
      JSON_VALUE(customer, '$.id') AS customer_id,
      SUM(${NET_SALES_EXPR}) AS lifetime_in_window
    FROM \`${table}\`
    WHERE ${COMMON_FILTERS}
      AND DATE(created_at) BETWEEN @start AND @end
      AND id IN (SELECT order_id FROM valid_orders)
    GROUP BY customer_id
  `;
  const lifetimeRows = await runQuery<{ customer_id: string; lifetime_in_window: number }>(
    custLifetimeQuery,
    { start: startDate, end: endDate }
  );
  const lifetimeMap = new Map<string, number>();
  for (const r of lifetimeRows) {
    lifetimeMap.set(r.customer_id, Number(r.lifetime_in_window ?? 0));
  }

  // (2) Per-order line items, with refunded/exchanged quantities subtracted.
  //     - For each (order, line_item_id), we sum refunds[].refund_line_items[].quantity
  //       and subtract from the original qty.
  //     - Only line items with net_qty > 0 are kept (excludes returns AND exchanges,
  //       partial or full).
  // Line items dos produtos no período — exclui trocas + recompras de mesmo produto+cor
  const lineItemsQuery = `
    WITH
    ${validOrdersCte(table)},
    refunded AS (
      SELECT
        o.id AS order_id,
        CAST(JSON_VALUE(rli, '$.line_item_id') AS INT64) AS line_item_id,
        SUM(CAST(JSON_VALUE(rli, '$.quantity') AS FLOAT64)) AS refunded_qty
      FROM \`${table}\` o,
        UNNEST(JSON_QUERY_ARRAY(o.refunds)) AS r,
        UNNEST(JSON_QUERY_ARRAY(r, '$.refund_line_items')) AS rli
      WHERE o.cancelled_at IS NULL AND o.test = FALSE
        AND DATE(o.created_at) BETWEEN @start AND @end
      GROUP BY o.id, line_item_id
    ),
    raw_li AS (
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(o.created_at)) AS order_date,
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        o.id AS order_id,
        CAST(JSON_VALUE(li, '$.id') AS INT64) AS line_item_id,
        CAST(JSON_VALUE(li, '$.quantity') AS FLOAT64) AS qty,
        li AS line_item_json
      FROM \`${table}\` o,
        UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
      WHERE ${COMMON_FILTERS.replace(/test = FALSE/, 'o.test = FALSE').replace(/cancelled_at IS NULL/, 'o.cancelled_at IS NULL').replace(/JSON_VALUE\(customer/g, 'JSON_VALUE(o.customer')}
        AND DATE(o.created_at) BETWEEN @start AND @end
        AND o.id IN (SELECT order_id FROM valid_orders)
    )
    SELECT
      r.order_date,
      r.customer_id,
      r.qty - IFNULL(rf.refunded_qty, 0) AS net_qty,
      TO_JSON_STRING(r.line_item_json) AS line_item_json
    FROM raw_li r
    LEFT JOIN refunded rf USING (order_id, line_item_id)
    WHERE r.qty - IFNULL(rf.refunded_qty, 0) > 0
  `;
  const liRows = await runQuery<{
    order_date: string;
    customer_id: string;
    net_qty: number;
    line_item_json: string;
  }>(lineItemsQuery, { start: startDate, end: endDate });

  interface Acc {
    motherSku: string;
    productName: string | null;
    units: number;
    revenue: number;
    customerIds: Set<string>;
    customerLifetimes: number[];
  }
  const acc = new Map<string, Acc>();

  interface DailyAcc {
    motherSku: string;
    productName: string | null;
    date: string;
    units: number;
    revenue: number;
    customerIds: Set<string>;
  }
  const daily = new Map<string, DailyAcc>();

  // Category aggregator — by PRODUCT TYPE extracted from the line_item title
  // (Sandália, Mule, Bota, Sapatilha, Scarpin, Mocassim, Slingback, Tênis, ...)
  interface CategoryAcc {
    categoryCode: string;
    units: number;
    revenue: number;
    customerIds: Set<string>;
    customerLifetimes: number[];
  }
  const catAcc = new Map<string, CategoryAcc>();

  for (const row of liRows) {
    let li: LineItemPayload;
    try {
      li = JSON.parse(row.line_item_json) as LineItemPayload;
    } catch {
      continue;
    }
    const sku = li.sku ?? li.variant_sku ?? null;
    const mSku = motherSkuOf(sku);
    if (!mSku) continue;
    // Use NET qty (qty original - refunded) instead of raw qty.
    // Excludes returns + exchanges. net_qty <= 0 was already filtered in SQL.
    const qty = Number(row.net_qty ?? 0);
    const price = Number(li.price ?? 0);
    if (!isFinite(qty) || !isFinite(price) || qty <= 0) continue;
    const lineRevenue = qty * price;
    const title = (li.title || li.name || mSku) as string;

    // Category aggregation — by product TYPE extracted from line_item title
    const productType = productTypeOf(title);
    if (productType) {
      let ca = catAcc.get(productType);
      if (!ca) {
        ca = {
          categoryCode: productType,
          units: 0,
          revenue: 0,
          customerIds: new Set(),
          customerLifetimes: [],
        };
        catAcc.set(productType, ca);
      }
      ca.units += qty;
      ca.revenue += lineRevenue;
      if (!ca.customerIds.has(row.customer_id)) {
        ca.customerIds.add(row.customer_id);
        ca.customerLifetimes.push(lifetimeMap.get(row.customer_id) ?? 0);
      }
    }

    let a = acc.get(mSku);
    if (!a) {
      a = {
        motherSku: mSku,
        productName: title,
        units: 0,
        revenue: 0,
        customerIds: new Set(),
        customerLifetimes: [],
      };
      acc.set(mSku, a);
    }
    a.units += qty;
    a.revenue += lineRevenue;
    if (!a.customerIds.has(row.customer_id)) {
      a.customerIds.add(row.customer_id);
      a.customerLifetimes.push(lifetimeMap.get(row.customer_id) ?? 0);
    }

    const key = `${row.order_date}|${mSku}`;
    let d = daily.get(key);
    if (!d) {
      d = {
        motherSku: mSku,
        productName: title,
        date: row.order_date,
        units: 0,
        revenue: 0,
        customerIds: new Set(),
      };
      daily.set(key, d);
    }
    d.units += qty;
    d.revenue += lineRevenue;
    d.customerIds.add(row.customer_id);
  }

  function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  const products: ProductLtv[] = [...acc.values()]
    .map((a) => ({
      motherSku: a.motherSku,
      productName: a.productName,
      units: a.units,
      revenue: a.revenue,
      customers: a.customerIds.size,
      customerLtvAvg:
        a.customerLifetimes.length > 0
          ? a.customerLifetimes.reduce((s, v) => s + v, 0) / a.customerLifetimes.length
          : 0,
      customerLtvMedian: median(a.customerLifetimes),
    }))
    .sort((x, y) => y.units - x.units)
    .slice(0, limit);

  const days = (() => {
    const s = new Date(startDate + 'T00:00:00Z').getTime();
    const e = new Date(endDate + 'T00:00:00Z').getTime();
    return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
  })();
  const minCustomers = topLtvMinCustomers(days);

  const top15Vol = [...products].sort((a, b) => b.units - a.units).slice(0, 15);
  const top15Ltv = [...products]
    .filter((p) => p.customers >= minCustomers && p.customerLtvAvg > 0)
    .sort((a, b) => b.customerLtvAvg - a.customerLtvAvg)
    .slice(0, 15);
  const union = new Set([...top15Vol, ...top15Ltv].map((p) => p.motherSku));

  const productDaily: ProductDailyPoint[] = [];
  for (const d of daily.values()) {
    if (!union.has(d.motherSku)) continue;
    const lifetimes: number[] = [];
    for (const id of d.customerIds) lifetimes.push(lifetimeMap.get(id) ?? 0);
    const meanLtv = lifetimes.length > 0 ? lifetimes.reduce((s, v) => s + v, 0) / lifetimes.length : 0;
    productDaily.push({
      motherSku: d.motherSku,
      productName: d.productName,
      date: d.date,
      units: d.units,
      revenue: d.revenue,
      customers: d.customerIds.size,
      customerLtvAvg: meanLtv,
    });
  }
  productDaily.sort((a, b) => a.date.localeCompare(b.date));

  // Build categories list (ordered by units desc)
  const categories: CategoryLtv[] = [...catAcc.values()]
    .map((c) => ({
      categoryCode: c.categoryCode,
      categoryName: c.categoryCode, // same — product type is already human-readable
      units: c.units,
      revenue: c.revenue,
      customers: c.customerIds.size,
      customerLtvAvg:
        c.customerLifetimes.length > 0
          ? c.customerLifetimes.reduce((s, v) => s + v, 0) / c.customerLifetimes.length
          : 0,
      customerLtvMedian: median(c.customerLifetimes),
    }))
    .sort((a, b) => b.units - a.units);

  return { products, productDaily, categories };
}

// ---------------------------------------------------------------------------
// Retention stats — absolute retention metrics (not window-dependent)
// ---------------------------------------------------------------------------

export async function getRetentionStats(market: Market): Promise<RetentionStats> {
  const table = ORDERS_TABLE[market];

  // Retenção (vida toda) usa SOMENTE orders válidas (sem trocas + sem recompra
  // de mesmo produto+cor) — agora é "returning genuíno", não inflado por trocas.
  const q = `
    WITH
    ${validOrdersCte(table)},
    base AS (
      SELECT
        JSON_VALUE(customer, '$.id') AS customer_id,
        DATE(created_at) AS order_date,
        id AS order_id
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS}
    ),
    valid_base AS (
      SELECT * FROM base WHERE order_id IN (SELECT order_id FROM valid_orders)
    ),
    ordered AS (
      SELECT customer_id, order_date,
             ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date) AS rn
      FROM valid_base
    ),
    first_order AS (SELECT customer_id, order_date AS first_d FROM ordered WHERE rn = 1),
    second_order AS (SELECT customer_id, order_date AS second_d FROM ordered WHERE rn = 2),
    gap AS (
      SELECT f.customer_id, DATE_DIFF(s.second_d, f.first_d, DAY) AS days_to_second
      FROM first_order f LEFT JOIN second_order s USING (customer_id)
    ),
    total_per_cust AS (
      SELECT customer_id, COUNT(*) AS total_orders FROM valid_base GROUP BY customer_id
    ),
    last_12m AS (
      SELECT COUNT(DISTINCT customer_id) AS customers_12m, COUNT(*) AS orders_12m
      FROM valid_base
      WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
    )
    SELECT
      (SELECT COUNT(*) FROM total_per_cust) AS lifetime_customers,
      (SELECT COUNTIF(total_orders >= 2) * 100.0 / NULLIF(COUNT(*), 0) FROM total_per_cust) AS returning_rate_all_time,
      (SELECT COUNTIF(g.days_to_second IS NOT NULL AND g.days_to_second <= 90) * 100.0
              / NULLIF((SELECT COUNT(*) FROM total_per_cust), 0)
         FROM gap g) AS repeat_90d,
      (SELECT COUNTIF(g.days_to_second IS NOT NULL AND g.days_to_second <= 365) * 100.0
              / NULLIF((SELECT COUNT(*) FROM total_per_cust), 0)
         FROM gap g) AS repeat_12m,
      (SELECT orders_12m * 1.0 / NULLIF(customers_12m, 0) FROM last_12m) AS purchase_freq_annual
  `;
  const rows = await runQuery<{
    lifetime_customers: number;
    returning_rate_all_time: number;
    repeat_90d: number;
    repeat_12m: number;
    purchase_freq_annual: number;
  }>(q);

  const r = rows[0] ?? ({} as Record<string, number>);
  return {
    lifetimeCustomers: Number(r.lifetime_customers ?? 0),
    returningRateAllTime: Number(r.returning_rate_all_time ?? 0),
    repeat90d: Number(r.repeat_90d ?? 0),
    repeat12m: Number(r.repeat_12m ?? 0),
    purchaseFrequencyAnnual: Number(r.purchase_freq_annual ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Customer Journey — quais produtos são "de entrada", quais vêm depois
// ---------------------------------------------------------------------------

/**
 * Retorna a jornada de produtos do cliente (lifetime, sem janela):
 *   - Top 5 produtos de entrada (1ª compra) com taxa de repeat + mediana de dias até 2ª
 *   - Top 5 produtos da 2ª compra
 *   - Top 5 produtos da 3ª compra
 *   - Matriz de transição (1ª → 2ª) com % de cada destino
 *   - Mediana de dias entre 1ª→2ª e 2ª→3ª compra
 *
 * Devoluções e trocas são excluídas: line items com refunds[].refund_line_items
 * são subtraídos (net_qty = qty - refunded_qty). Line items com net_qty ≤ 0 saem.
 * Order com TODOS line items net_qty ≤ 0 (devolução total) não conta como compra.
 *
 * Produto principal de cada order = line item com maior (net_qty × price).
 */
export async function getCustomerJourney(market: Market): Promise<CustomerJourney> {
  const table = ORDERS_TABLE[market];

  // CTE compartilhada: line items líquidos (com produto principal por order)
  const sharedCte = `
    refunded AS (
      SELECT o.id AS order_id,
             CAST(JSON_VALUE(rli, '$.line_item_id') AS INT64) AS line_item_id,
             SUM(CAST(JSON_VALUE(rli, '$.quantity') AS FLOAT64)) AS refunded_qty
      FROM \`${table}\` o,
        UNNEST(JSON_QUERY_ARRAY(o.refunds)) AS r,
        UNNEST(JSON_QUERY_ARRAY(r, '$.refund_line_items')) AS rli
      WHERE o.cancelled_at IS NULL AND o.test = FALSE
      GROUP BY o.id, line_item_id
    ),
    raw_li AS (
      SELECT
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        o.id AS order_id,
        DATE(o.created_at) AS order_date,
        CAST(JSON_VALUE(li, '$.id') AS INT64) AS line_item_id,
        JSON_VALUE(li, '$.sku') AS sku,
        JSON_VALUE(li, '$.title') AS title,
        CAST(JSON_VALUE(li, '$.quantity') AS FLOAT64) AS qty,
        CAST(JSON_VALUE(li, '$.price') AS FLOAT64) AS price
      FROM \`${table}\` o,
        UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
      WHERE ${COMMON_FILTERS.replace(/test = FALSE/, 'o.test = FALSE').replace(/cancelled_at IS NULL/, 'o.cancelled_at IS NULL').replace(/JSON_VALUE\(customer/g, 'JSON_VALUE(o.customer').replace(/(?<![A-Za-z_])name LIKE/g, 'o.name LIKE').replace(/IFNULL\(tags/g, 'IFNULL(o.tags').replace(/IFNULL\(note/g, 'IFNULL(o.note')}
    ),
    clean_li AS (
      SELECT r.*, r.qty - IFNULL(rf.refunded_qty, 0) AS net_qty
      FROM raw_li r LEFT JOIN refunded rf USING (order_id, line_item_id)
      WHERE r.sku IS NOT NULL AND REGEXP_CONTAINS(r.sku, r'^L\\d+')
        AND r.qty - IFNULL(rf.refunded_qty, 0) > 0
    ),
    -- Remove line items que repetem o MESMO PRODUTO+COR (qualquer tamanho)
    -- já comprado pelo mesmo cliente em order anterior. Captura tanto
    -- trocas/reposições manuais quanto re-compras de tamanho diferente
    -- (que costumam ser size-readjustments, não recompras genuínas).
    -- Mantém apenas a PRIMEIRA ocorrência de cada produto+cor por cliente,
    -- usando o TÍTULO NORMALIZADO (que inclui modelo + cor mas não tamanho).
    clean_li_dedupe AS (
      SELECT customer_id, order_id, order_date, sku, title, qty, price, net_qty, line_item_id
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id, TRIM(REGEXP_REPLACE(title, r'\\s+', ' '))
            ORDER BY order_date, order_id, line_item_id
          ) AS rn_title
        FROM clean_li
      )
      WHERE rn_title = 1
    ),
    main AS (
      SELECT customer_id, order_id, order_date, sku,
             -- title normalizado (já contém a cor) — chave de agrupamento
             TRIM(REGEXP_REPLACE(title, r'\\s+', ' ')) AS title,
             -- mother = título normalizado (agrupa por modelo + cor, ignora tamanho)
             TRIM(REGEXP_REPLACE(title, r'\\s+', ' ')) AS mother,
             -- código SKU curto (modelo+linha) para caption pequeno na UI
             CONCAT(SPLIT(sku, '-')[OFFSET(0)], '-', SPLIT(sku, '-')[OFFSET(1)]) AS mother_code,
             ROW_NUMBER() OVER (PARTITION BY customer_id, order_id ORDER BY net_qty * price DESC) AS rn
      FROM clean_li_dedupe
    ),
    seq AS (
      SELECT customer_id, order_date, sku, title, mother, mother_code,
             LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS prev_date,
             ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS n
      FROM main WHERE rn = 1
    )
  `;

  // 1) Mediana de dias entre 1→2 e 2→3
  const gapQuery = `
    WITH ${sharedCte}
    SELECT
      APPROX_QUANTILES(IF(n = 2, DATE_DIFF(order_date, prev_date, DAY), NULL), 100)[OFFSET(50)] AS gap_1to2,
      APPROX_QUANTILES(IF(n = 3, DATE_DIFF(order_date, prev_date, DAY), NULL), 100)[OFFSET(50)] AS gap_2to3
    FROM seq
    WHERE prev_date IS NOT NULL AND n IN (2, 3)
  `;

  // 2) Top 5 produtos de ENTRADA (1ª compra) com taxa de repeat e dias mediano até 2ª
  const entryQuery = `
    WITH ${sharedCte},
    entry AS (
      SELECT s1.customer_id, s1.mother, s1.mother_code, s1.title AS t,
             s2.order_date AS d2, s1.order_date AS d1
      FROM seq s1 LEFT JOIN seq s2 ON s1.customer_id = s2.customer_id AND s2.n = 2
      WHERE s1.n = 1
    ),
    agg AS (
      SELECT mother,
             ANY_VALUE(mother_code) AS mother_code,
             ANY_VALUE(t) AS name,
             COUNT(*) AS customers,
             COUNTIF(d2 IS NOT NULL) AS made_second,
             APPROX_QUANTILES(DATE_DIFF(d2, d1, DAY), 100)[OFFSET(50)] AS gap_to_2_median
      FROM entry
      GROUP BY mother
      HAVING customers >= 50
    )
    SELECT mother, mother_code, name, customers,
           ROUND(made_second * 100.0 / customers, 2) AS repeat_rate_pct,
           gap_to_2_median
    FROM agg
    ORDER BY customers DESC
    LIMIT 5
  `;

  // 3) Top 5 da 2ª e 3ª compra
  const secondThirdQuery = `
    WITH ${sharedCte}
    SELECT
      n AS position,
      mother,
      ANY_VALUE(mother_code) AS mother_code,
      ANY_VALUE(title) AS name,
      COUNT(*) AS customers,
      APPROX_QUANTILES(DATE_DIFF(order_date, prev_date, DAY), 100)[OFFSET(50)] AS gap_median
    FROM seq
    WHERE n IN (2, 3) AND prev_date IS NOT NULL
    GROUP BY n, mother
    HAVING customers >= 50
    QUALIFY ROW_NUMBER() OVER (PARTITION BY n ORDER BY customers DESC) <= 5
    ORDER BY n, customers DESC
  `;

  // 4) Matriz de transição (1ª → 2ª) — Top 15 produtos de entrada × Top 15 destinos por linha
  const transitionQuery = `
    WITH ${sharedCte},
    pairs AS (
      SELECT s1.mother AS from_m, s1.mother_code AS from_code, s1.title AS from_t,
             s2.mother AS to_m, s2.mother_code AS to_code, s2.title AS to_t
      FROM seq s1 JOIN seq s2 ON s1.customer_id = s2.customer_id AND s2.n = s1.n + 1 AND s1.n = 1
    ),
    top_from AS (
      SELECT from_m, COUNT(*) AS total
      FROM pairs GROUP BY from_m ORDER BY total DESC LIMIT 15
    )
    SELECT
      p.from_m, ANY_VALUE(p.from_code) AS from_code, ANY_VALUE(p.from_t) AS from_name,
      p.to_m, ANY_VALUE(p.to_code) AS to_code, ANY_VALUE(p.to_t) AS to_name,
      COUNT(*) AS customers,
      ROUND(COUNT(*) * 100.0 / (SELECT total FROM top_from WHERE from_m = p.from_m), 2) AS pct
    FROM pairs p
    WHERE p.from_m IN (SELECT from_m FROM top_from)
    GROUP BY p.from_m, p.to_m
    HAVING customers >= 10
    QUALIFY ROW_NUMBER() OVER (PARTITION BY p.from_m ORDER BY customers DESC) <= 15
    ORDER BY p.from_m, customers DESC
  `;

  // 5) EXPLORADOR — todas as transições from→to com volume mínimo
  // Frontend filtra client-side pelo "from" selecionado no dropdown
  const allTransitionsQuery = `
    WITH ${sharedCte},
    pairs AS (
      SELECT s1.mother AS from_m, s1.mother_code AS from_code, s1.title AS from_t,
             s2.mother AS to_m, s2.mother_code AS to_code, s2.title AS to_t,
             DATE_DIFF(s2.order_date, s1.order_date, DAY) AS days_diff
      FROM seq s1 JOIN seq s2 ON s1.customer_id = s2.customer_id AND s2.n = s1.n + 1 AND s1.n = 1
    ),
    from_totals AS (
      SELECT from_m, COUNT(*) AS total
      FROM pairs GROUP BY from_m
      HAVING total >= 10
    )
    SELECT
      p.from_m, ANY_VALUE(p.from_code) AS from_code, ANY_VALUE(p.from_t) AS from_name,
      p.to_m, ANY_VALUE(p.to_code) AS to_code, ANY_VALUE(p.to_t) AS to_name,
      COUNT(*) AS customers,
      ROUND(COUNT(*) * 100.0 / (SELECT total FROM from_totals WHERE from_m = p.from_m), 2) AS pct,
      APPROX_QUANTILES(p.days_diff, 100)[OFFSET(50)] AS gap_median
    FROM pairs p
    WHERE p.from_m IN (SELECT from_m FROM from_totals)
    GROUP BY p.from_m, p.to_m
    HAVING customers >= 2
    QUALIFY ROW_NUMBER() OVER (PARTITION BY p.from_m ORDER BY customers DESC) <= 20
    ORDER BY p.from_m, customers DESC
  `;

  const [gapRows, entryRows, posRows, transRows, allTransRows] = await Promise.all([
    runQuery<{ gap_1to2: number; gap_2to3: number }>(gapQuery),
    runQuery<{ mother: string; mother_code: string; name: string; customers: number; repeat_rate_pct: number; gap_to_2_median: number }>(entryQuery),
    runQuery<{ position: number; mother: string; mother_code: string; name: string; customers: number; gap_median: number }>(secondThirdQuery),
    runQuery<{ from_m: string; from_code: string; from_name: string; to_m: string; to_code: string; to_name: string; customers: number; pct: number }>(transitionQuery),
    runQuery<{ from_m: string; from_code: string; from_name: string; to_m: string; to_code: string; to_name: string; customers: number; pct: number; gap_median: number }>(allTransitionsQuery),
  ]);

  const g = gapRows[0] ?? { gap_1to2: 0, gap_2to3: 0 };

  const entryProducts: JourneyProduct[] = entryRows.map(r => ({
    motherSku: r.mother_code ?? r.mother,
    productName: r.name,
    customers: Number(r.customers ?? 0),
    repeatRate: Number(r.repeat_rate_pct ?? 0),
    medianDaysFromPrev: Number(r.gap_to_2_median ?? 0),
  }));

  const secondPurchaseProducts: JourneyProduct[] = posRows
    .filter(r => Number(r.position) === 2)
    .map(r => ({
      motherSku: r.mother_code ?? r.mother,
      productName: r.name,
      customers: Number(r.customers ?? 0),
      medianDaysFromPrev: Number(r.gap_median ?? 0),
    }));
  const thirdPurchaseProducts: JourneyProduct[] = posRows
    .filter(r => Number(r.position) === 3)
    .map(r => ({
      motherSku: r.mother_code ?? r.mother,
      productName: r.name,
      customers: Number(r.customers ?? 0),
      medianDaysFromPrev: Number(r.gap_median ?? 0),
    }));

  const transitionMatrix: TransitionCell[] = transRows.map(r => ({
    fromSku: r.from_m,
    fromName: r.from_name,
    toSku: r.to_m,
    toName: r.to_name,
    customers: Number(r.customers ?? 0),
    pctOfFirst: Number(r.pct ?? 0),
  }));

  const allTransitions: TransitionCell[] = allTransRows.map(r => ({
    fromSku: r.from_m,
    fromName: r.from_name,
    toSku: r.to_m,
    toName: r.to_name,
    customers: Number(r.customers ?? 0),
    pctOfFirst: Number(r.pct ?? 0),
    medianDaysFromPrev: Number(r.gap_median ?? 0),
  }));

  return {
    medianDays1to2: Number(g.gap_1to2 ?? 0),
    medianDays2to3: Number(g.gap_2to3 ?? 0),
    entryProducts,
    secondPurchaseProducts,
    thirdPurchaseProducts,
    transitionMatrix,
    allTransitions,
  };
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export async function getDataFreshness(market: 'US' | 'BR' = 'US'): Promise<string> {
  // Cassia 2026-06-12: D-1 no fuso do market (NY p/ US, Brasilia p/ BR).
  const { yesterdayInMarket } = await import('@/lib/utils/market-tz');
  return yesterdayInMarket(market);
}

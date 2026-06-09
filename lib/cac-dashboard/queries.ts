/**
 * Orchestration layer — combines direct ad-platform APIs with Shopify Admin API.
 *
 * SOURCES (in priority order, per Larroude integration policy):
 *   - Meta Ads spend  → Meta Marketing API (lib/connectors/meta-ads.ts)
 *   - Google Ads spend → Google Ads API (lib/connectors/google-ads.ts)
 *                        falls back to BigQuery (gold_marketing.fct_ads_spend_daily)
 *                        only if GADS_REFRESH_TOKEN is missing.
 *   - Customers / Orders / Products → Shopify Admin GraphQL (lib/connectors/shopify.ts)
 *
 * BigQuery is used ONLY for the 12-month monthly series (where pulling 365d
 * via Shopify pagination would take minutes) and as a Google Ads fallback.
 */

import { runQuery } from './bigquery';
import { getMetaSpendByDay } from './connectors/meta-ads';
import { getGoogleAdsSpendByDay } from './connectors/google-ads';
import { getShopifyAggregate } from './connectors/shopify';

export type Market = 'US' | 'BR';

const ECON_TABLE: Record<Market, string> = {
    US: 'larroude-data-prod.gold.unite_economics_us',
    BR: 'larroude-data-prod.gold.unite_economics_br',
};

export interface DataSourceMeta {
  metaAds: 'api';
  googleAds: 'api' | 'bigquery_fallback';
  shopify: 'api';
  monthly: 'bigquery';
}

export interface KpiSummary {
  market: Market;
  spend: number;
  metaSpend: number;
  googleSpend: number;
  newCustomers: number;
  cac: number;
  orders: number;
  revenue: number;
  cpo: number;
  startDate: string;
  endDate: string;
  sources: DataSourceMeta;
}

export interface DailyPoint {
  date: string;
  spend: number;
  newCustomers: number;
  cac: number;
}

export interface MonthlyPoint {
  month: string;
  spend: number;
  newCustomers: number;
  cac: number;
}

export interface ProductCac {
  motherSku: string;
  productName: string | null;
  units: number;
  revenue: number;
  newCustomers: number;
  allocatedSpend: number;
  cac: number;
  revenuePerCustomer: number;
}

/** Daily point per product. Used by Tendência Diária + Matriz Diária. */
export interface ProductDailyPoint {
  motherSku: string;
  productName: string | null;
  date: string; // YYYY-MM-DD
  units: number;
  newCustomers: number;
  revenue: number;
  allocatedSpend: number;
  cac: number;
}

/** Combined return type of getProductCac: aggregated rows + daily series for the union A∪B. */
export interface ProductCacResult {
  products: ProductCac[];
  productDaily: ProductDailyPoint[];
}

function sumMap(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

function mergeDailySpend(meta: Map<string, number>, google: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [d, v] of meta) out.set(d, (out.get(d) ?? 0) + v);
  for (const [d, v] of google) out.set(d, (out.get(d) ?? 0) + v);
  return out;
}

/**
 * Top-level KPI for the period.
 */
export async function getKpiSummary(
  market: Market,
  startDate: string,
  endDate: string
): Promise<KpiSummary> {
  const [metaSpend, gAds, shopify] = await Promise.all([
    getMetaSpendByDay(market, startDate, endDate),
    getGoogleAdsSpendByDay(market, startDate, endDate),
    getShopifyAggregate(market, startDate, endDate),
  ]);

  const metaTotal = sumMap(metaSpend);
  const googleTotal = sumMap(gAds.data);
  const spend = metaTotal + googleTotal;

  let newCustomers = 0;
  let orders = 0;
  let revenue = 0;
  for (const day of shopify.daily.values()) {
    newCustomers += day.newCustomers;
    orders += day.orders;
    revenue += day.revenue;
  }

  return {
    market,
    spend,
    metaSpend: metaTotal,
    googleSpend: googleTotal,
    newCustomers,
    cac: newCustomers > 0 ? spend / newCustomers : 0,
    orders,
    revenue,
    cpo: orders > 0 ? spend / orders : 0,
    startDate,
    endDate,
    sources: {
      metaAds: 'api',
      googleAds: gAds.source,
      shopify: 'api',
      monthly: 'bigquery',
    },
  };
}

/**
 * Daily series — joins Meta+Google spend per day with Shopify new customers.
 */
export async function getDailySeries(
  market: Market,
  startDate: string,
  endDate: string
): Promise<DailyPoint[]> {
  const [metaSpend, gAds, shopify] = await Promise.all([
    getMetaSpendByDay(market, startDate, endDate),
    getGoogleAdsSpendByDay(market, startDate, endDate),
    getShopifyAggregate(market, startDate, endDate),
  ]);

  const dailySpend = mergeDailySpend(metaSpend, gAds.data);

  // Build the full date range so chart shows zero days
  const out: DailyPoint[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const spend = dailySpend.get(iso) ?? 0;
    const day = shopify.daily.get(iso);
    const newCustomers = day?.newCustomers ?? 0;
    out.push({
      date: iso,
      spend,
      newCustomers,
      cac: newCustomers > 0 ? spend / newCustomers : 0,
    });
  }
  return out;
}

/**
 * Monthly series for the last 12 months.
 *
 * Strategy:
 *   - Spend: Meta Marketing API + Google Ads API DIRECT (per integration policy).
 *     A single request per Meta account returns 365 daily rows, so we aggregate
 *     to monthly client-side.
 *   - New customers: BigQuery unite_economics_* (instant — no pagination cost).
 *
 * BigQuery is used ONLY for new customers because pulling 365d of Shopify orders
 * via GraphQL pagination would take minutes per request.
 */
export async function getMonthlySeries(market: Market): Promise<MonthlyPoint[]> {
  // 12-month window: from start of (current month - 11) to today
  const today = new Date();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const startISO = startMonth.toISOString().slice(0, 10);
  const endISO = today.toISOString().slice(0, 10);

  // 1) Meta + Google spend day-by-day (direct APIs)
  const [metaDaily, googleResult] = await Promise.all([
    getMetaSpendByDay(market, startISO, endISO),
    getGoogleAdsSpendByDay(market, startISO, endISO),
  ]);

  // 2) Aggregate to month
  const spendByMonth = new Map<string, number>();
  const addMap = (m: Map<string, number>) => {
    for (const [date, value] of m) {
      const ym = date.slice(0, 7); // YYYY-MM
      spendByMonth.set(ym, (spendByMonth.get(ym) ?? 0) + value);
    }
  };
  addMap(metaDaily);
  addMap(googleResult.data);

  // 3) New customers per month from BigQuery (DTC only, non-cancelled)
  const econTable = ECON_TABLE[market];
  const econQuery = `
    SELECT
      FORMAT_DATE('%Y-%m', order_date) AS month,
      COUNT(DISTINCT CASE WHEN is_new_customer = 1 THEN customer_id END) AS new_customers
    FROM \`${econTable}\`
    WHERE order_date >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 11 MONTH), MONTH)
      AND cancelled_at IS NULL
      AND sales_channel = 'DTC'
    GROUP BY month
  `;
  const econRows = await runQuery<{ month: string; new_customers: number }>(econQuery);
  const newByMonth = new Map<string, number>();
  for (const r of econRows) newByMonth.set(r.month, Number(r.new_customers ?? 0));

  // 4) Build the month list (12 months ending current month)
  const months: MonthlyPoint[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const spend = spendByMonth.get(ym) ?? 0;
    const newC = newByMonth.get(ym) ?? 0;
    months.push({
      month: ym,
      spend,
      newCustomers: newC,
      cac: newC > 0 ? spend / newC : 0,
    });
  }
  return months;
}

/**
 * CAC per product (mother_sku).
 *
 * Allocation: spend[d] is split across products proportional to product
 * revenue on day d. Then cac[p] = SUM(allocated_spend[p]) / new_customers[p].
 */
export async function getProductCac(
  market: Market,
  startDate: string,
  endDate: string,
  limit = 200
): Promise<ProductCacResult> {
  const [metaSpend, gAds, shopify] = await Promise.all([
    getMetaSpendByDay(market, startDate, endDate),
    getGoogleAdsSpendByDay(market, startDate, endDate),
    getShopifyAggregate(market, startDate, endDate),
  ]);

  const dailySpend = mergeDailySpend(metaSpend, gAds.data);

  // Daily total revenue from Shopify (denominator for proportional alloc)
  const dailyTotalRev = new Map<string, number>();
  for (const day of shopify.daily.values()) {
    dailyTotalRev.set(day.date, (dailyTotalRev.get(day.date) ?? 0) + day.revenue);
  }

  // Aggregate per mother SKU
  interface Acc {
    motherSku: string;
    productName: string;
    units: number;
    revenue: number;
    newCustomers: number;
    allocatedSpend: number;
  }
  const acc = new Map<string, Acc>();

  for (const pd of shopify.productDaily.values()) {
    const totalRev = dailyTotalRev.get(pd.date) ?? 0;
    const daySpend = dailySpend.get(pd.date) ?? 0;
    const share = totalRev > 0 ? pd.revenue / totalRev : 0;
    const allocated = daySpend * share;

    let a = acc.get(pd.motherSku);
    if (!a) {
      a = {
        motherSku: pd.motherSku,
        productName: pd.productTitle,
        units: 0,
        revenue: 0,
        newCustomers: 0,
        allocatedSpend: 0,
      };
      acc.set(pd.motherSku, a);
    }
    a.units += pd.units;
    a.revenue += pd.revenue;
    a.newCustomers += pd.newCustomers;
    a.allocatedSpend += allocated;
  }

  const out: ProductCac[] = [...acc.values()]
    .map((a) => ({
      motherSku: a.motherSku,
      productName: a.productName,
      units: a.units,
      revenue: a.revenue,
      newCustomers: a.newCustomers,
      allocatedSpend: a.allocatedSpend,
      cac: a.newCustomers > 0 ? a.allocatedSpend / a.newCustomers : 0,
      revenuePerCustomer: a.newCustomers > 0 ? a.revenue / a.newCustomers : 0,
    }))
    .sort((x, y) => y.units - x.units)
    .slice(0, limit);

  // ---- Build daily series for the union A ∪ B (top 15 volume + top 15 menor CAC) ----
  const days = (() => {
    const s = new Date(startDate + 'T00:00:00Z').getTime();
    const e = new Date(endDate + 'T00:00:00Z').getTime();
    return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
  })();
  const minNew = days <= 28 ? 20 : days <= 60 ? 43 : 64;

  const top15Vol = [...out].sort((a, b) => b.units - a.units).slice(0, 15);
  const top15Low = [...out]
    .filter((p) => p.newCustomers >= minNew && p.cac > 0)
    .sort((a, b) => a.cac - b.cac)
    .slice(0, 15);
  const unionSkus = new Set([...top15Vol, ...top15Low].map((p) => p.motherSku));

  const productDaily: ProductDailyPoint[] = [];
  for (const pd of shopify.productDaily.values()) {
    if (!unionSkus.has(pd.motherSku)) continue;
    const totalRev = dailyTotalRev.get(pd.date) ?? 0;
    const daySpend = dailySpend.get(pd.date) ?? 0;
    const share = totalRev > 0 ? pd.revenue / totalRev : 0;
    const allocated = daySpend > 0 ? daySpend * share : 0;
    productDaily.push({
      motherSku: pd.motherSku,
      productName: pd.productTitle,
      date: pd.date,
      units: pd.units,
      newCustomers: pd.newCustomers,
      revenue: pd.revenue,
      allocatedSpend: allocated,
      cac: pd.newCustomers > 0 ? allocated / pd.newCustomers : 0,
    });
  }
  productDaily.sort((a, b) => a.date.localeCompare(b.date));

  return { products: out, productDaily };
}

/**
 * Most recent date with finalized data — yesterday in the store's timezone.
 * We don't ping APIs here; just return D-1 in UTC which is safe for both markets.
 */
export async function getDataFreshness(): Promise<string> {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

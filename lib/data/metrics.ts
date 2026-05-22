import type { Market, Period, MetricBundle, Metric, MetricSource } from "@/types/metric";
import { dateRangeForPeriod, previousPeriodRange } from "@/lib/utils/periods";
import { formatCurrency, formatMultiplier, formatNumber, formatPercent } from "@/lib/utils/format";
import { hasBigQueryCredentials, runQuery } from "@/lib/bigquery/client";
import { ordersAggregateSQL, adsSpendSQL } from "@/lib/bigquery/queries/metrics";
import { cached } from "@/lib/cache";

type AggRow = {
  orders: number;
  gross_sales: number;
  total_sales: number;
  new_customers: number;
  aov: number;
};

type AdsRow = {
  meta_spend: number;
  google_spend: number;
  total_spend: number;
};

async function fetchOrdersBQ(market: Market, range: { from: string; to: string }): Promise<AggRow | null> {
  if (!hasBigQueryCredentials()) return null;
  try {
    const rows = await runQuery<AggRow>(ordersAggregateSQL(market), {
      from: range.from,
      to: range.to,
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchAdsBQ(market: Market, range: { from: string; to: string }): Promise<AdsRow | null> {
  if (!hasBigQueryCredentials()) return null;
  try {
    const rows = await runQuery<AdsRow>(adsSpendSQL(market), {
      market: market.toLowerCase(),
      from: range.from,
      to: range.to,
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function mockOrders(market: Market): AggRow {
  return market === "US"
    ? { orders: 9_870, gross_sales: 3_460_000, total_sales: 2_800_000, new_customers: 6_240, aov: 284 }
    : { orders: 3_847, gross_sales: 2_140_000, total_sales: 1_950_000, new_customers: 2_390, aov: 556 };
}

function mockAds(market: Market): AdsRow {
  return market === "US"
    ? { meta_spend: 946_000, google_spend: 137_000, total_spend: 1_083_000 }
    : { meta_spend: 412_000, google_spend: 72_000, total_spend: 484_000 };
}

function mockOrdersPrev(market: Market): AggRow {
  return market === "US"
    ? { orders: 6_120, gross_sales: 2_145_000, total_sales: 1_730_000, new_customers: 3_870, aov: 282 }
    : { orders: 3_170, gross_sales: 1_807_000, total_sales: 1_645_000, new_customers: 2_005, aov: 519 };
}

function mockAdsPrev(market: Market): AdsRow {
  return market === "US"
    ? { meta_spend: 569_000, google_spend: 99_000, total_spend: 568_000 }
    : { meta_spend: 365_000, google_spend: 64_000, total_spend: 429_000 };
}

function pct(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

export async function getMetricBundle(market: Market, period: Period): Promise<MetricBundle> {
  const cacheKey = `metrics:${market}:${period}`;
  return cached(cacheKey, 300, async () => {
    const range = dateRangeForPeriod(period);
    const prevRange = previousPeriodRange(period);

    const [ordersBQ, adsBQ, prevOrdersBQ, prevAdsBQ] = await Promise.all([
      fetchOrdersBQ(market, range),
      fetchAdsBQ(market, range),
      fetchOrdersBQ(market, prevRange),
      fetchAdsBQ(market, prevRange),
    ]);

    const source: MetricSource = ordersBQ || adsBQ ? "BQ" : "Mock";
    const orders = ordersBQ ?? mockOrders(market);
    const ads = adsBQ ?? mockAds(market);
    const prevOrders = prevOrdersBQ ?? mockOrdersPrev(market);
    const prevAds = prevAdsBQ ?? mockAdsPrev(market);

    const currency = market === "US" ? "USD" : "BRL";

    const roasGross = ads.total_spend ? orders.gross_sales / ads.total_spend : 0;
    const roasOrder = ads.total_spend ? orders.total_sales / ads.total_spend : 0;
    const prevRoasGross = prevAds.total_spend ? prevOrders.gross_sales / prevAds.total_spend : 0;
    const cvr = orders.orders ? (orders.orders / 1_000_000) * 100 : 0; // placeholder
    const cac = orders.new_customers ? ads.total_spend / orders.new_customers : 0;
    const prevCac = prevOrders.new_customers ? prevAds.total_spend / prevOrders.new_customers : 0;

    const fresh_until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const generated_at = new Date().toISOString();

    const baseMetric = (m: Partial<Metric>): Metric => ({
      key: m.key!,
      label: m.label!,
      value: m.value!,
      formatted: m.formatted!,
      currency: m.currency ?? currency,
      delta_pct: m.delta_pct ?? null,
      delta_label: m.delta_pct != null ? formatPercent(m.delta_pct) : null,
      period: range,
      market,
      source,
      fresh_until,
      hint: m.hint,
    });

    const metrics: Metric[] = [
      baseMetric({
        key: "amount_spent",
        label: "AMOUNT SPENT",
        value: ads.total_spend,
        formatted: formatCurrency(ads.total_spend, currency),
        delta_pct: pct(ads.total_spend, prevAds.total_spend),
      }),
      baseMetric({
        key: "meta_spend",
        label: "META SPEND",
        value: ads.meta_spend,
        formatted: formatCurrency(ads.meta_spend, currency),
        delta_pct: pct(ads.meta_spend, prevAds.meta_spend),
      }),
      baseMetric({
        key: "google_spend",
        label: "GOOGLE SPEND",
        value: ads.google_spend,
        formatted: formatCurrency(ads.google_spend, currency),
        delta_pct: pct(ads.google_spend, prevAds.google_spend),
        hint: market === "US" ? "Google US" : "Google BR",
      }),
      baseMetric({
        key: "roas_gross",
        label: "ROAS GROSS",
        value: roasGross,
        formatted: formatMultiplier(roasGross),
        currency: null,
        delta_pct: pct(roasGross, prevRoasGross),
      }),
      baseMetric({
        key: "roas_order",
        label: "ROAS ORDER",
        value: roasOrder,
        formatted: formatMultiplier(roasOrder),
        currency: null,
        hint: "Rev / Spend",
      }),
      baseMetric({
        key: "cac",
        label: "CAC",
        value: cac,
        formatted: formatCurrency(cac, currency, false),
        delta_pct: pct(cac, prevCac),
      }),
      baseMetric({
        key: "gross_sales",
        label: "GROSS SALES",
        value: orders.gross_sales,
        formatted: formatCurrency(orders.gross_sales, currency),
        delta_pct: pct(orders.gross_sales, prevOrders.gross_sales),
      }),
      baseMetric({
        key: "total_sales",
        label: "TOTAL SALES",
        value: orders.total_sales,
        formatted: formatCurrency(orders.total_sales, currency),
        delta_pct: pct(orders.total_sales, prevOrders.total_sales),
      }),
      baseMetric({
        key: "orders",
        label: "ORDERS",
        value: orders.orders,
        formatted: formatNumber(orders.orders),
        currency: null,
        delta_pct: pct(orders.orders, prevOrders.orders),
      }),
      baseMetric({
        key: "aov",
        label: "AOV",
        value: orders.aov,
        formatted: formatCurrency(orders.aov, currency, false),
        hint: market === "US" ? "United States" : "Brasil",
      }),
      baseMetric({
        key: "new_customers",
        label: "NEW CUSTOMERS",
        value: orders.new_customers,
        formatted: formatNumber(orders.new_customers),
        currency: null,
        delta_pct: pct(orders.new_customers, prevOrders.new_customers),
      }),
    ];

    return {
      market,
      period,
      date_range: range,
      metrics,
      generated_at,
    };
  });
}

import type { Market, Period, MetricBundle, Metric, MetricSource } from "@/types/metric";
import { dateRangeForPeriod, previousPeriodRange, periodToDays } from "@/lib/utils/periods";
import { formatCurrency, formatMultiplier, formatNumber, formatPercent } from "@/lib/utils/format";
import { hasBigQueryCredentials, runQuery } from "@/lib/bigquery/client";
import { aggregatedKpisSQL } from "@/lib/bigquery/queries/metrics";
import { cached } from "@/lib/cache";

type AggRow = {
  gross_sales: number | string;
  discounts: number | string;
  order_revenue: number | string;
  total_sales: number | string;
  orders: number;
  aov: number | string;
  spend: number | string;
  meta_spend: number | string;
  google_spend: number | string;
  roas_gross: number;
  roas_order: number;
  roas_total: number;
  new_customers: number;
  cac: number;
};

// Periodo: ultimos N dias COMPLETOS (sem hoje), igual ao dashboard principal
function dateRangeCompleted(period: Period, today = new Date()): { from: string; to: string } {
  const days = periodToDays(period);
  // "to" = ontem
  const to = new Date(today.getTime() - 24 * 3600 * 1000);
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function previousDateRangeCompleted(period: Period, today = new Date()): { from: string; to: string } {
  const days = periodToDays(period);
  const to = new Date(today.getTime() - (days + 1) * 24 * 3600 * 1000);
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function fetchKpis(market: Market, range: { from: string; to: string }): Promise<AggRow | null> {
  if (!hasBigQueryCredentials()) return null;
  try {
    const rows = await runQuery<AggRow>(aggregatedKpisSQL(market), {
      market_lower: market.toLowerCase(),
      start: range.from,
      end: range.to,
    });
    return rows[0] ?? null;
  } catch (err) {
    console.error(`fetchKpis(${market}) failed:`, err);
    return null;
  }
}

function num(v: unknown): number {
  if (v == null) return 0;
  // BigQuery NUMERIC pode vir como string, number, ou objeto BigQueryNumeric
  // BigQueryNumeric tem .toString() ou .value
  if (typeof v === "object" && v !== null) {
    if ("value" in v) return Number((v as { value: unknown }).value) || 0;
    return Number((v as object).toString()) || 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

const MOCK_US: AggRow = {
  gross_sales: 3_252_000, discounts: 313_000, order_revenue: 3_135_000, total_sales: 2_820_000,
  orders: 10_296, aov: 333, spend: 1_100_000, meta_spend: 945_000, google_spend: 151_000,
  roas_gross: 3.21, roas_order: 3.13, roas_total: 2.57, new_customers: 4_754, cac: 231,
};

const MOCK_BR: AggRow = {
  gross_sales: 9_250_000, discounts: 800_000, order_revenue: 9_400_000, total_sales: 9_530_000,
  orders: 12_500, aov: 760, spend: 695_000, meta_spend: 442_000, google_spend: 241_000,
  roas_gross: 13.29, roas_order: 13.70, roas_total: 13.70, new_customers: 7_700, cac: 90,
};

export async function getMetricBundle(market: Market, period: Period): Promise<MetricBundle> {
  const cacheKey = `metrics-v3:${market}:${period}`;
  return cached(cacheKey, 300, async () => {
    const range = dateRangeCompleted(period);
    const prevRange = previousDateRangeCompleted(period);

    const [curr, prev] = await Promise.all([
      fetchKpis(market, range),
      fetchKpis(market, prevRange),
    ]);

    const source: MetricSource = curr ? "BQ" : "Mock";
    const c = curr ?? (market === "US" ? MOCK_US : MOCK_BR);
    const p = prev ?? (market === "US" ? MOCK_US : MOCK_BR);
    const currency = market === "US" ? "USD" : "BRL";

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

    // Alinhado com dashboard principal: meta_spend = (total BQ) - google_spend
    // Pega TUDO que nao e Google (Meta + TikTok + Pinterest + etc)
    const cGoogleSpend = num(c.google_spend);
    const pGoogleSpend = num(p.google_spend);
    const cTotalSpendBQ = num(c.spend);
    const pTotalSpendBQ = num(p.spend);
    const cMetaSpend = Math.max(0, cTotalSpendBQ - cGoogleSpend);
    const pMetaSpend = Math.max(0, pTotalSpendBQ - pGoogleSpend);
    const cSpend = cMetaSpend + cGoogleSpend;
    const pSpend = pMetaSpend + pGoogleSpend;
    const cGross = num(c.gross_sales), pGross = num(p.gross_sales);
    const cOrderRev = num(c.order_revenue), pOrderRev = num(p.order_revenue);
    const cTotal = num(c.total_sales), pTotal = num(p.total_sales);
    const cAov = num(c.aov);
    const cCac = num(c.cac), pCac = num(p.cac);

    const metrics: Metric[] = [
      baseMetric({
        key: "amount_spent",
        label: "AMOUNT SPENT",
        value: cSpend,
        formatted: formatCurrency(cSpend, currency),
        delta_pct: pct(cSpend, pSpend),
      }),
      baseMetric({
        key: "meta_spend",
        label: "META SPEND",
        value: cMetaSpend,
        formatted: formatCurrency(cMetaSpend, currency),
        delta_pct: pct(cMetaSpend, pMetaSpend),
      }),
      baseMetric({
        key: "google_spend",
        label: "GOOGLE SPEND",
        value: cGoogleSpend,
        formatted: formatCurrency(cGoogleSpend, currency),
        delta_pct: pct(cGoogleSpend, pGoogleSpend),
        hint: market === "US" ? "Google Ads US" : "Google Ads BR",
      }),
      baseMetric({
        key: "roas_gross",
        label: "ROAS GROSS",
        value: c.roas_gross,
        formatted: formatMultiplier(c.roas_gross),
        currency: null,
        delta_pct: pct(c.roas_gross, p.roas_gross),
      }),
      baseMetric({
        key: "roas_order",
        label: "ROAS ORDER",
        value: c.roas_order,
        formatted: formatMultiplier(c.roas_order),
        currency: null,
        hint: "Order Revenue / Spend",
      }),
      baseMetric({
        key: "cac",
        label: "CAC",
        value: cCac,
        formatted: formatCurrency(cCac, currency, false),
        delta_pct: pct(cCac, pCac),
      }),
      baseMetric({
        key: "gross_sales",
        label: "GROSS SALES",
        value: cGross,
        formatted: formatCurrency(cGross, currency),
        delta_pct: pct(cGross, pGross),
      }),
      baseMetric({
        key: "total_sales",
        label: "TOTAL SALES",
        value: cTotal,
        formatted: formatCurrency(cTotal, currency),
        delta_pct: pct(cTotal, pTotal),
      }),
      baseMetric({
        key: "orders",
        label: "ORDERS",
        value: c.orders,
        formatted: formatNumber(c.orders),
        currency: null,
        delta_pct: pct(c.orders, p.orders),
      }),
      baseMetric({
        key: "aov",
        label: "AOV",
        value: cAov,
        formatted: formatCurrency(cAov, currency, false),
        hint: market === "US" ? "Order Rev / Orders" : "Order Rev / Orders",
      }),
      baseMetric({
        key: "new_customers",
        label: "NEW CUSTOMERS",
        value: c.new_customers,
        formatted: formatNumber(c.new_customers),
        currency: null,
        delta_pct: pct(c.new_customers, p.new_customers),
      }),
    ];

    return { market, period, date_range: range, metrics, generated_at };
  });
}

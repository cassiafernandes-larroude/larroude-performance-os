import type { Market } from "@/types/metric";
import { hasBigQueryCredentials } from "@/lib/bigquery/client";
import { getMetricBundle } from "@/lib/data/metrics";
import { getNorthStarBundle } from "@/lib/data/northstar";
import { cached } from "@/lib/cache";
import { queryChannelMix } from "@/lib/main-dashboard/queries";
import { getDashboardPayload } from "@/lib/main-dashboard/dashboard-service";
import type { DailyPoint } from "@/lib/main-dashboard/types";

const TZ: Record<Market, string> = { US: "America/New_York", BR: "America/Sao_Paulo" };

// FX rate fallback BRL → USD. Em produção pegamos do BQ gold.fx_rates_monthly,
// mas se faltar usamos esse valor médio recente.
const BRL_USD_FALLBACK = 1 / 5.45;

export type ChannelRow = {
  channel: string;
  revenue: number;          // sempre em USD (consolidado)
  orders: number;
  share_pct: number;
};

export type ExecutiveBundle = {
  market: Market;
  period: { from: string; to: string };
  source: "BQ" | "Mock";
  net_revenue: number;
  gross_revenue: number;
  ad_spend: number;
  meta_spend: number;
  google_spend: number;
  marketing_efficiency: number;
  contribution_margin: number;
  contribution_margin_pct: number;
  burn_rate_pct: number;
  cac: number;
  ltv_predictive: number;
  payback_period_months: number;
  channels: ChannelRow[];
};

/**
 * Cassia 2026-06-12: visão consolidada US+BR em USD.
 * - Total Investment (ad spend US + BR convertido)
 * - Total Revenue (net sales)
 * - ROAS (revenue / spend)
 * - Profit (revenue − spend)
 * - Channel share unificado
 * - Daily series (spend, revenue) consolidados
 */
export type ExecutiveConsolidated = {
  period: { from: string; to: string };
  source: "BQ" | "Mock";
  currency: "USD";
  fxBrlUsd: number;          // taxa usada para converter BR
  total_revenue: number;     // net (total_sales) US + BR em USD
  total_gross_revenue: number;
  total_ad_spend: number;
  total_meta_spend: number;
  total_google_spend: number;
  roas: number;              // total_revenue / total_ad_spend
  profit: number;            // total_revenue - total_ad_spend
  profit_margin_pct: number; // profit / total_revenue
  // Daily series consolidados (US + BR convertido p/ USD).
  daily: {
    spend: DailyPoint[];
    total_sales: DailyPoint[];
    gross_sales: DailyPoint[];
    margin_total_sales: DailyPoint[]; // revenue - spend por dia
    roas_total: DailyPoint[];          // safeDiv por dia
  };
  // Channel share consolidado em USD.
  channels: ChannelRow[];
  // Por market (referência rápida).
  by_market: {
    US: { revenue: number; spend: number; meta: number; google: number };
    BR: { revenue: number; spend: number; meta: number; google: number; revenue_brl: number; spend_brl: number };
  };
};

const MOCK: Record<Market, Omit<ExecutiveBundle, "market" | "period" | "source">> = {
  US: {
    net_revenue: 2820000, gross_revenue: 3520000, ad_spend: 1100000,
    meta_spend: 945000, google_spend: 151000,
    marketing_efficiency: 2.57, contribution_margin: 1720000, contribution_margin_pct: 61,
    burn_rate_pct: 39, cac: 231, ltv_predictive: 403, payback_period_months: 6.9,
    channels: [],
  },
  BR: {
    net_revenue: 7700000, gross_revenue: 9250000, ad_spend: 2500000,
    meta_spend: 2280000, google_spend: 240000,
    marketing_efficiency: 3.08, contribution_margin: 5200000, contribution_margin_pct: 67.5,
    burn_rate_pct: 32.5, cac: 344, ltv_predictive: 1167, payback_period_months: 3.5,
    channels: [],
  },
};

export async function getExecutiveBundle(market: Market): Promise<ExecutiveBundle> {
  return cached(`executive-v6-mainChannel:${market}`, 1800, async () => {
    const today = new Date();
    const to = new Date(today.getTime() - 24 * 3600 * 1000);
    const from = new Date(to.getTime() - 27 * 24 * 3600 * 1000);
    const range = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };

    if (!hasBigQueryCredentials()) {
      return { market, period: range, source: "Mock", ...MOCK[market] };
    }

    try {
      const overview = await getMetricBundle(market, "28d");
      const getVal = (key: string) => Number(overview.metrics.find((m) => m.key === key)?.value) || 0;

      const netRevenue = getVal("total_sales");
      const grossRevenue = getVal("gross_sales");
      const adSpend = getVal("amount_spent");
      const metaSpend = getVal("meta_spend");
      const googleSpend = getVal("google_spend");
      const cac28d = getVal("cac");

      const northStar = await getNorthStarBundle(market);
      const ltvPredictive = northStar.ltv_predictive;

      let channels: ChannelRow[] = [];
      try {
        const chRows = await queryChannelMix(market, range.from, range.to);
        const totalRev = chRows.reduce((s, r) => s + Number(r.revenue), 0);
        const consolidated = new Map<string, { revenue: number; orders: number }>();
        for (const r of chRows) {
          const channelName = (r.channel === 'Orgânico Search' || r.channel === 'Orgânico Social')
            ? 'Orgânico'
            : r.channel;
          const ex = consolidated.get(channelName) ?? { revenue: 0, orders: 0 };
          ex.revenue += Number(r.revenue);
          ex.orders += Number(r.orders);
          consolidated.set(channelName, ex);
        }
        channels = Array.from(consolidated.entries())
          .map(([channel, v]) => ({
            channel,
            revenue: v.revenue,
            orders: v.orders,
            share_pct: totalRev > 0 ? (v.revenue / totalRev) * 100 : 0,
          }))
          .sort((a, b) => b.revenue - a.revenue);
      } catch (err) {
        console.warn("channel mix failed:", err);
      }

      const marketingEfficiency = adSpend > 0 ? netRevenue / adSpend : 0;
      const contributionMargin = netRevenue - adSpend;
      const contributionMarginPct = netRevenue > 0 ? (contributionMargin / netRevenue) * 100 : 0;
      const burnRatePct = netRevenue > 0 ? (adSpend / netRevenue) * 100 : 0;
      const paybackMonths = ltvPredictive > 0 ? cac28d / (ltvPredictive / (northStar.customer_lifetime * 12)) : 0;

      return {
        market, period: range, source: "BQ" as const,
        net_revenue: netRevenue,
        gross_revenue: grossRevenue,
        ad_spend: adSpend,
        meta_spend: metaSpend,
        google_spend: googleSpend,
        marketing_efficiency: marketingEfficiency,
        contribution_margin: contributionMargin,
        contribution_margin_pct: contributionMarginPct,
        burn_rate_pct: burnRatePct,
        cac: cac28d,
        ltv_predictive: ltvPredictive,
        payback_period_months: paybackMonths,
        channels,
      };
    } catch (err) {
      console.error("executive query failed:", err);
      return { market, period: range, source: "Mock" as const, ...MOCK[market] };
    }
  });
}

// Resolve FX BRL → USD do mês mais recente em BQ. Fallback 1/5.45.
async function getRecentBrlUsdRate(): Promise<number> {
  if (!hasBigQueryCredentials()) return BRL_USD_FALLBACK;
  try {
    const { runQuery } = await import("@/lib/bigquery/client");
    const rows = await runQuery<{ avg_rate_brl_usd?: number | string }>(
      `SELECT avg_rate_brl_usd FROM \`larroude-data-prod.gold.fx_rates_monthly\` ORDER BY month DESC LIMIT 1`,
      {}
    );
    const rate = Number(rows?.[0]?.avg_rate_brl_usd);
    if (rate > 0 && rate < 20) return 1 / rate;
  } catch {}
  return BRL_USD_FALLBACK;
}

function mergeDailyAdd(a: DailyPoint[], b: DailyPoint[], bMultiplier = 1): DailyPoint[] {
  const m = new Map<string, number>();
  for (const p of a) m.set(p.date, (m.get(p.date) ?? 0) + p.value);
  for (const p of b) m.set(p.date, (m.get(p.date) ?? 0) + p.value * bMultiplier);
  return Array.from(m.entries())
    .sort(([d1], [d2]) => d1.localeCompare(d2))
    .map(([date, value]) => ({ date, value }));
}

function safeDiv(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

/**
 * Cassia 2026-06-12: filtro de período igual Main Dashboard.
 * Aceita preset (7d/14d/28d/3M/6M/12M) OU custom range {from, to}.
 */
export type ExecutivePeriod = '7d' | '14d' | '28d' | '3M' | '6M' | '12M';

function rangeForPeriod(period: ExecutivePeriod, customRange?: { from: string; to: string }): { from: string; to: string } {
  if (customRange) return customRange;
  const today = new Date();
  const to = new Date(today.getTime() - 24 * 3600 * 1000);
  // Cassia 2026-06-13: 3M/6M/12M usam "primeiro dia do mês N-1 atrás → hoje (D-1)".
  if (period === '3M' || period === '6M' || period === '12M') {
    const n = period === '3M' ? 3 : period === '6M' ? 6 : 12;
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (n - 1), 1));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  const days = period === '7d' ? 7 : period === '14d' ? 14 : 28;
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function getExecutiveConsolidated(
  period: ExecutivePeriod = '28d',
  customRange?: { from: string; to: string },
): Promise<ExecutiveConsolidated> {
  const range = rangeForPeriod(period, customRange);
  const cacheKey = customRange
    ? `executive-consolidated-v3:custom:${customRange.from}:${customRange.to}`
    : `executive-consolidated-v3:${period}`;
  return cached(cacheKey, 1800, async () => {
    const fxRate = await getRecentBrlUsdRate(); // BRL → USD

    if (!hasBigQueryCredentials()) {
      const mockUsd = { US: 2820000, BR: 7700000 * fxRate };
      const mockSpend = { US: 1100000, BR: 2500000 * fxRate };
      const totalRev = mockUsd.US + mockUsd.BR;
      const totalSpend = mockSpend.US + mockSpend.BR;
      return {
        period: range, source: "Mock", currency: "USD", fxBrlUsd: fxRate,
        total_revenue: totalRev, total_gross_revenue: totalRev * 1.1,
        total_ad_spend: totalSpend, total_meta_spend: totalSpend * 0.85, total_google_spend: totalSpend * 0.15,
        roas: totalRev / totalSpend, profit: totalRev - totalSpend,
        profit_margin_pct: ((totalRev - totalSpend) / totalRev) * 100,
        daily: { spend: [], total_sales: [], gross_sales: [], margin_total_sales: [], roas_total: [] },
        channels: [],
        by_market: {
          US: { revenue: mockUsd.US, spend: mockSpend.US, meta: mockSpend.US * 0.85, google: mockSpend.US * 0.15 },
          BR: { revenue: mockUsd.BR, spend: mockSpend.BR, meta: mockSpend.BR * 0.85, google: mockSpend.BR * 0.15, revenue_brl: 7700000, spend_brl: 2500000 },
        },
      };
    }

    try {
      // Busca payloads completos em paralelo. Heavy mas reusa cache do Main Dashboard.
      // Cassia 2026-06-12: seguir as mesmas regras dos outros dashboards
      // -> reusa getDashboardPayload (filtros B2B, PIX, ajuste Meta US +400k Set/25, etc).
      // Quando custom range, passamos customStart pra getDashboardPayload usar mesma janela.
      const [us, br, usChannels, brChannels] = await Promise.all([
        getDashboardPayload("US", period, range.to, customRange?.from),
        getDashboardPayload("BR", period, range.to, customRange?.from),
        queryChannelMix("US", range.from, range.to).catch(() => []),
        queryChannelMix("BR", range.from, range.to).catch(() => []),
      ]);

      // Extrai KPIs do payload.kpis (label-based)
      const kpiVal = (kpis: typeof us.kpis, label: string): number => {
        const k = kpis.find((x) => x.label === label);
        return Number(k?.raw ?? 0) || 0;
      };

      const usRev = kpiVal(us.kpis, "TOTAL SALES");
      const brRevNative = kpiVal(br.kpis, "TOTAL SALES");
      const brRevUsd = brRevNative * fxRate;

      const usGross = kpiVal(us.kpis, "GROSS SALES");
      const brGrossNative = kpiVal(br.kpis, "GROSS SALES");
      const brGrossUsd = brGrossNative * fxRate;

      const usSpend = kpiVal(us.kpis, "AMOUNT SPENT");
      const brSpendNative = kpiVal(br.kpis, "AMOUNT SPENT");
      const brSpendUsd = brSpendNative * fxRate;

      const usMeta = kpiVal(us.kpis, "META SPEND");
      const brMetaNative = kpiVal(br.kpis, "META SPEND");
      const brMetaUsd = brMetaNative * fxRate;

      const usGoogle = kpiVal(us.kpis, "GOOGLE SPEND");
      const brGoogleNative = kpiVal(br.kpis, "GOOGLE SPEND");
      const brGoogleUsd = brGoogleNative * fxRate;

      const totalRev = usRev + brRevUsd;
      const totalGross = usGross + brGrossUsd;
      const totalSpend = usSpend + brSpendUsd;
      const totalMeta = usMeta + brMetaUsd;
      const totalGoogle = usGoogle + brGoogleUsd;
      const profit = totalRev - totalSpend;

      // Daily consolidado: BR convertido em USD via fxRate.
      const dailySpend = mergeDailyAdd(us.daily.spend ?? [], br.daily.spend ?? [], fxRate);
      const dailyRev = mergeDailyAdd(us.daily.total_sales ?? [], br.daily.total_sales ?? [], fxRate);
      const dailyGross = mergeDailyAdd(us.daily.gross_sales ?? [], br.daily.gross_sales ?? [], fxRate);
      const dailyMargin = dailyRev.map((p) => {
        const sp = dailySpend.find((s) => s.date === p.date)?.value ?? 0;
        return { date: p.date, value: p.value - sp };
      });
      const dailyRoas = dailyRev.map((p) => {
        const sp = dailySpend.find((s) => s.date === p.date)?.value ?? 0;
        return { date: p.date, value: safeDiv(p.value, sp) };
      });

      // Channel share consolidado: merge US + BR(em USD).
      const chMerged = new Map<string, { revenue: number; orders: number }>();
      const consolidate = (rows: typeof usChannels, multiplier: number) => {
        for (const r of rows) {
          const name = (r.channel === 'Orgânico Search' || r.channel === 'Orgânico Social') ? 'Orgânico' : r.channel;
          const ex = chMerged.get(name) ?? { revenue: 0, orders: 0 };
          ex.revenue += Number(r.revenue) * multiplier;
          ex.orders += Number(r.orders);
          chMerged.set(name, ex);
        }
      };
      consolidate(usChannels, 1);
      consolidate(brChannels, fxRate);
      const chTotal = Array.from(chMerged.values()).reduce((s, x) => s + x.revenue, 0);
      const channels: ChannelRow[] = Array.from(chMerged.entries())
        .map(([channel, v]) => ({
          channel,
          revenue: v.revenue,
          orders: v.orders,
          share_pct: chTotal > 0 ? (v.revenue / chTotal) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return {
        period: range,
        source: "BQ" as const,
        currency: "USD" as const,
        fxBrlUsd: fxRate,
        total_revenue: totalRev,
        total_gross_revenue: totalGross,
        total_ad_spend: totalSpend,
        total_meta_spend: totalMeta,
        total_google_spend: totalGoogle,
        roas: safeDiv(totalRev, totalSpend),
        profit,
        profit_margin_pct: totalRev > 0 ? (profit / totalRev) * 100 : 0,
        daily: {
          spend: dailySpend,
          total_sales: dailyRev,
          gross_sales: dailyGross,
          margin_total_sales: dailyMargin,
          roas_total: dailyRoas,
        },
        channels,
        by_market: {
          US: { revenue: usRev, spend: usSpend, meta: usMeta, google: usGoogle },
          BR: { revenue: brRevUsd, spend: brSpendUsd, meta: brMetaUsd, google: brGoogleUsd, revenue_brl: brRevNative, spend_brl: brSpendNative },
        },
      };
    } catch (err) {
      console.error("executive consolidated failed:", err);
      return {
        period: range, source: "Mock", currency: "USD", fxBrlUsd: fxRate,
        total_revenue: 0, total_gross_revenue: 0, total_ad_spend: 0, total_meta_spend: 0, total_google_spend: 0,
        roas: 0, profit: 0, profit_margin_pct: 0,
        daily: { spend: [], total_sales: [], gross_sales: [], margin_total_sales: [], roas_total: [] },
        channels: [],
        by_market: {
          US: { revenue: 0, spend: 0, meta: 0, google: 0 },
          BR: { revenue: 0, spend: 0, meta: 0, google: 0, revenue_brl: 0, spend_brl: 0 },
        },
      };
    }
  });
}

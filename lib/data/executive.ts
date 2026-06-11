import type { Market } from "@/types/metric";
import { hasBigQueryCredentials } from "@/lib/bigquery/client";
import { getMetricBundle } from "@/lib/data/metrics";
import { getNorthStarBundle } from "@/lib/data/northstar";
import { cached } from "@/lib/cache";
import { queryChannelMix } from "@/lib/main-dashboard/queries";

const TZ: Record<Market, string> = { US: "America/New_York", BR: "America/Sao_Paulo" };

export type ChannelRow = {
  channel: string;
  revenue: number;
  orders: number;
  share_pct: number;
};

export type ExecutiveBundle = {
  market: Market;
  period: { from: string; to: string };
  source: "BQ" | "Mock";
  // Core financial KPIs (28d, batendo com Overview)
  net_revenue: number;             // total_sales do Overview
  gross_revenue: number;           // gross_sales do Overview
  ad_spend: number;                // amount_spent do Overview
  meta_spend: number;
  google_spend: number;
  marketing_efficiency: number;    // net_revenue / ad_spend (igual ROAS Total do dashboard)
  contribution_margin: number;
  contribution_margin_pct: number;
  burn_rate_pct: number;
  // CAC e Payback alinhados ao North Star (LTV Dashboard oficial)
  cac: number;                     // 28d (mesmo do Overview)
  ltv_predictive: number;          // 12m, formula oficial LTV Dashboard
  payback_period_months: number;   // CAC / (LTV / 12)
  // Channel mix (mesma query do dashboard principal)
  channels: ChannelRow[];
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
    // Periodo 28d completo (igual Overview)
    const today = new Date();
    const to = new Date(today.getTime() - 24 * 3600 * 1000);
    const from = new Date(to.getTime() - 27 * 24 * 3600 * 1000);
    const range = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };

    if (!hasBigQueryCredentials()) {
      return { market, period: range, source: "Mock", ...MOCK[market] };
    }

    try {
      // 1. REUSAR getMetricBundle (mesma fonte do Overview) para net/gross/spend
      const overview = await getMetricBundle(market, "28d");
      const getVal = (key: string) => Number(overview.metrics.find((m) => m.key === key)?.value) || 0;

      const netRevenue = getVal("total_sales");
      const grossRevenue = getVal("gross_sales");
      const adSpend = getVal("amount_spent");
      const metaSpend = getVal("meta_spend");
      const googleSpend = getVal("google_spend");
      const cac28d = getVal("cac");

      // 2. REUSAR getNorthStarBundle para LTV 12m (formula oficial LTV Dashboard)
      const northStar = await getNorthStarBundle(market);
      const ltvPredictive = northStar.ltv_predictive;

      // 3. Channel mix — REUSA queryChannelMix do Main Dashboard (mesma classificação).
      // Cassia 2026-06-11: replicar divisão de faturamento por canal do Main.
      let channels: ChannelRow[] = [];
      try {
        const chRows = await queryChannelMix(market, range.from, range.to);
        const totalRev = chRows.reduce((s, r) => s + Number(r.revenue), 0);
        // Consolida Orgânico Search + Social → 'Orgânico' (mesma regra do Main).
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

      // Calculados
      const marketingEfficiency = adSpend > 0 ? netRevenue / adSpend : 0;
      const contributionMargin = netRevenue - adSpend;
      const contributionMarginPct = netRevenue > 0 ? (contributionMargin / netRevenue) * 100 : 0;
      const burnRatePct = netRevenue > 0 ? (adSpend / netRevenue) * 100 : 0;
      // Payback: CAC / (LTV mensal). Lifetime do North Star ja considera retention
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

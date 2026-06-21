import type { Market } from "@/types/metric";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";
import { getMetaSpendApi, hasMetaCredentials } from "@/lib/meta-api";
import { getMetaSpendAdjustment } from "@/lib/shared/meta-adjustments";
import { cached } from "@/lib/cache";

export type NorthStarBundle = {
  market: Market;
  period: { from: string; to: string };
  source: "BQ" | "Mock" | "Unavailable";
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

// Cassia 2026-06-17 (auditoria): removido ORDERS_TABLE (data-platform), commonFilters e
// NET_SALES_EXPR — eram CODIGO MORTO de uma versao antiga. O North Star delega 100% ao
// getLtvKpiSummary do LTV Dashboard (data-prod), garantindo convergencia. Nao havia
// divergencia de warehouse (data-platform e data-prod tem os mesmos dados); era so' codigo nao usado.

// Cassia 2026-06-21: SEM dados-mock. Em falha/sem-credencial devolvemos ZEROS + source
// "Unavailable" — a UI avisa que os dados nao carregaram, NUNCA exibe LTV/CAC inventados.
const ZERO_BUNDLE: Omit<NorthStarBundle, "market" | "period" | "source"> = {
  ltv_predictive: 0, ltv_historical: 0, ltv_cac: 0, cac: 0,
  returning_rate: 0, aov: 0, purchase_frequency: 0, customer_lifetime: 0,
  total_customers: 0, predictive_customers: 0, returning_customers: 0,
  new_customers: 0, total_ad_spend: 0, meta_spend: 0, google_spend: 0,
  total_net_sales: 0,
};

export async function getNorthStarBundle(market: Market): Promise<NorthStarBundle> {
  return cached(`northstar-v7:${market}`, 1800, async () => {
    // Janela 12 meses, terminando ontem
    const today = new Date();
    const to = new Date(today.getTime() - 24 * 3600 * 1000);
    const from = new Date(to.getTime() - 365 * 24 * 3600 * 1000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    if (!hasBigQueryCredentials()) {
      return {
        market, period: { from: fromStr, to: toStr }, source: "Unavailable",
        ...ZERO_BUNDLE,
      };
    }

    try {
      // Cassia 2026-06-14: REGRA — North Star reusa EXATAMENTE getLtvKpiSummary do LTV Dashboard.
      // Garante paridade 100% entre os dois painéis (mesma SQL, mesmos filtros, mesmo BigQuery).
      const { getLtvKpiSummary } = await import('@/lib/ltv-dashboard/queries');
      const ltv = await getLtvKpiSummary(market, fromStr, toStr);

      const totalCustomers = ltv.totalCustomers;
      const predictiveCustomers = ltv.predictiveCustomers;
      const returningCustomers = ltv.returningCustomers;
      const historicNetSales = ltv.totalRevenue;
      const aov = ltv.aov;
      const purchaseFrequency = ltv.purchaseFrequency;
      const returningCustomerRate = ltv.returningCustomerRate / 100; // 0..1
      const customerLifetime = ltv.customerLifetime;
      const ltvPredictive = ltv.ltvPredictive;
      const ltvHistorical = ltv.ltvHistorical;
      const newCustomers = ltv.newCustomers;

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

      // Cassia 2026-06-21: ajuste manual Meta US +$400k Set/2025 (pro-rata), MESMA regra do
      // Main/CAC/LTV/Overview. Retorna 0 fora de US/Set-2025.
      metaSpend += getMetaSpendAdjustment(market, fromStr, toStr);

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
        market, period: { from: fromStr, to: toStr }, source: "Unavailable" as const,
        ...ZERO_BUNDLE,
      };
    }
  });
}

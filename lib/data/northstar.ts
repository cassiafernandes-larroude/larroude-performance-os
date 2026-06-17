import type { Market } from "@/types/metric";
import { EXCLUDED_TAGS_REGEX } from "@/lib/shared/dtc-filters";
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
        NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}')
      )
    )
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(tags, '')), r'${EXCLUDED_TAGS_REGEX}')
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

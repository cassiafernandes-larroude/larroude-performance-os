import type { Market } from "@/types/metric";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";
import { getMetaSpendApi, hasMetaCredentials } from "@/lib/meta-api";
import { cached } from "@/lib/cache";
import { dateRangeForPeriod, previousPeriodRange } from "@/lib/utils/periods";

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
  // Core financial KPIs
  net_revenue: number;          // gross - discounts - refunds
  gross_revenue: number;
  ad_spend: number;
  marketing_efficiency: number; // net_revenue / ad_spend (ROAS líquido)
  contribution_margin: number;  // net_revenue - ad_spend (proxy, sem COGS)
  contribution_margin_pct: number; // % do net_revenue
  burn_rate_pct: number;        // ad_spend / net_revenue * 100
  payback_period_months: number;// CAC / (LTV per month)
  cac: number;
  ltv_predictive: number;
  // Top channels
  channels: ChannelRow[];
};

const MOCK: Record<Market, Omit<ExecutiveBundle, "market" | "period" | "source">> = {
  US: {
    net_revenue: 2820000, gross_revenue: 3520000, ad_spend: 1100000,
    marketing_efficiency: 2.56, contribution_margin: 1720000, contribution_margin_pct: 61,
    burn_rate_pct: 39, payback_period_months: 6.8, cac: 231, ltv_predictive: 403,
    channels: [
      { channel: "Meta Ads", revenue: 940000, orders: 2800, share_pct: 33.3 },
      { channel: "Google Ads", revenue: 480000, orders: 1450, share_pct: 17.0 },
      { channel: "Klaviyo Email", revenue: 380000, orders: 1100, share_pct: 13.5 },
      { channel: "Sem UTM / Direto", revenue: 720000, orders: 2200, share_pct: 25.5 },
      { channel: "Outros", revenue: 300000, orders: 750, share_pct: 10.6 },
    ],
  },
  BR: {
    net_revenue: 7700000, gross_revenue: 9250000, ad_spend: 2500000,
    marketing_efficiency: 3.08, contribution_margin: 5200000, contribution_margin_pct: 67.5,
    burn_rate_pct: 32.5, payback_period_months: 3.5, cac: 344, ltv_predictive: 1167,
    channels: [
      { channel: "Meta Ads", revenue: 3800000, orders: 5400, share_pct: 49.3 },
      { channel: "Google Ads", revenue: 1100000, orders: 1500, share_pct: 14.3 },
      { channel: "Klaviyo Email", revenue: 900000, orders: 1300, share_pct: 11.7 },
      { channel: "Sem UTM / Direto", revenue: 1500000, orders: 2100, share_pct: 19.5 },
      { channel: "Outros", revenue: 400000, orders: 600, share_pct: 5.2 },
    ],
  },
};

export async function getExecutiveBundle(market: Market): Promise<ExecutiveBundle> {
  return cached(`executive-v1:${market}`, 600, async () => {
    // Periodo 28d (igual ao Overview)
    const range = (() => {
      const today = new Date();
      const to = new Date(today.getTime() - 24 * 3600 * 1000);
      const from = new Date(to.getTime() - 27 * 24 * 3600 * 1000);
      return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    })();

    if (!hasBigQueryCredentials()) {
      return { market, period: range, source: "Mock", ...MOCK[market] };
    }

    const dataset = market === "US" ? "stg_shopify" : "stg_shopify_br";
    const tz = TZ[market];

    try {
      // 1. Net revenue, gross, refunds (mesma fonte do Overview)
      const aggSql = `
        WITH sales AS (
          SELECT
            SUM(CAST(total_line_items_price AS NUMERIC)) AS gross_sales,
            SUM(CAST(total_discounts AS NUMERIC)) AS discounts,
            SUM(CAST(total_price AS NUMERIC)) AS order_revenue,
            COUNT(*) AS orders
          FROM \`larroude-data-prod.${dataset}.orders\`
          WHERE DATE(created_at, '${tz}') BETWEEN @from AND @to
            AND financial_status NOT IN ('voided','refunded')
        ),
        refunds AS (
          SELECT IFNULL(SUM(
            (SELECT SUM(CAST(JSON_VALUE(t,'$.amount') AS NUMERIC))
             FROM UNNEST(JSON_QUERY_ARRAY(transactions)) t
             WHERE JSON_VALUE(t,'$.kind') = 'refund')
          ), 0) AS refund_value
          FROM \`larroude-data-prod.${dataset}.order_refunds\`
          WHERE DATE(created_at, '${tz}') BETWEEN @from AND @to
        ),
        google_ads AS (
          SELECT SUM(IF(LOWER(channel) LIKE 'google%', spend, 0)) AS google_spend
          FROM \`larroude-data-prod.gold.all_channels_daily\`
          WHERE LOWER(market) = @m AND date BETWEEN @from AND @to
        ),
        first_order AS (
          SELECT JSON_VALUE(customer, '$.id') AS cust_id, MIN(DATE(created_at, '${tz}')) AS first_dt
          FROM \`larroude-data-prod.${dataset}.orders\`
          WHERE customer IS NOT NULL AND financial_status NOT IN ('voided','refunded')
          GROUP BY cust_id
        ),
        new_in_period AS (
          SELECT COUNT(*) AS new_customers FROM first_order WHERE first_dt BETWEEN @from AND @to
        )
        SELECT s.gross_sales, s.order_revenue, r.refund_value, g.google_spend, n.new_customers
        FROM sales s, refunds r, google_ads g, new_in_period n
      `;
      const aggRows = await runQuery<{
        gross_sales: number | string;
        order_revenue: number | string;
        refund_value: number | string;
        google_spend: number | string;
        new_customers: number;
      }>(aggSql, { from: range.from, to: range.to, m: market.toLowerCase() });
      const a = aggRows[0] ?? {} as Record<string, never>;

      const grossRev = Number((a as { gross_sales: number | string }).gross_sales) || 0;
      const orderRev = Number((a as { order_revenue: number | string }).order_revenue) || 0;
      const refundVal = Number((a as { refund_value: number | string }).refund_value) || 0;
      const googleSpend = Number((a as { google_spend: number | string }).google_spend) || 0;
      const newCust = Number((a as { new_customers: number }).new_customers) || 0;

      const netRevenue = orderRev - refundVal;

      // Meta spend via API direta
      let metaSpend = 0;
      if (hasMetaCredentials()) {
        try {
          metaSpend = await getMetaSpendApi(market, range.from, range.to);
        } catch {}
      }
      const adSpend = metaSpend + googleSpend;

      // Channel mix
      let channels: ChannelRow[] = [];
      try {
        const channelSql = `
          WITH parsed AS (
            SELECT CAST(total_price AS NUMERIC) AS revenue,
              LOWER(IFNULL(landing_site, '')) AS landing,
              LOWER(IFNULL(referring_site, '')) AS referrer
            FROM \`larroude-data-prod.${dataset}.orders\`
            WHERE DATE(created_at, '${tz}') BETWEEN @from AND @to
              AND financial_status NOT IN ('voided','refunded')
          ),
          classified AS (
            SELECT revenue,
              CASE
                WHEN NOT REGEXP_CONTAINS(landing, r'utm_source=') THEN 'Sem UTM / Direto'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=(meta|facebook|ig_paid|ig_ads|fb_ads|fb|instagram_paid|fb_paid)') THEN 'Meta Ads'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=(instagram|facebook|meta|fb|ig)') AND REGEXP_CONTAINS(landing, r'utm_medium=(paid|cpc|cpm|social_paid|paidsocial|paid_social)') THEN 'Meta Ads'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=(instagram|facebook|meta|fb|ig)') AND NOT REGEXP_CONTAINS(landing, r'utm_medium=') THEN 'Meta Ads'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=klaviyo') THEN 'Klaviyo Email'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=google') OR REGEXP_CONTAINS(landing, r'gclid=') THEN 'Google Ads'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=attentive') OR REGEXP_CONTAINS(landing, r'utm_medium=sms') THEN 'SMS'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=awin') THEN 'Awin Affiliate'
                WHEN REGEXP_CONTAINS(landing, r'utm_source=shopmy') THEN 'ShopMy'
                WHEN REGEXP_CONTAINS(landing, r'criteo') OR REGEXP_CONTAINS(referrer, r'criteo') THEN 'Criteo'
                ELSE 'Outros'
              END AS channel
            FROM parsed
          )
          SELECT channel, SUM(revenue) AS revenue, COUNT(*) AS orders
          FROM classified GROUP BY channel ORDER BY revenue DESC LIMIT 10
        `;
        const chRows = await runQuery<{ channel: string; revenue: number | string; orders: number }>(channelSql, { from: range.from, to: range.to });
        const totalRev = chRows.reduce((s, r) => s + Number(r.revenue), 0);
        channels = chRows.map((r) => ({
          channel: r.channel,
          revenue: Number(r.revenue),
          orders: Number(r.orders),
          share_pct: totalRev > 0 ? (Number(r.revenue) / totalRev) * 100 : 0,
        }));
      } catch (err) {
        console.warn("channel mix failed:", err);
      }

      // Métricas calculadas
      const marketingEfficiency = adSpend > 0 ? netRevenue / adSpend : 0;
      const contributionMargin = netRevenue - adSpend;
      const contributionMarginPct = netRevenue > 0 ? (contributionMargin / netRevenue) * 100 : 0;
      const burnRatePct = netRevenue > 0 ? (adSpend / netRevenue) * 100 : 0;
      const cac = newCust > 0 ? adSpend / newCust : 0;

      // LTV proxy rápido (vai vir do BQ pra ficar consistente com North Star, mas pra Executive uso AOV*Freq simplificado)
      const aov = (a as { order_revenue: number | string; }).order_revenue && newCust ? orderRev / newCust : 0;
      const ltvPredictive = aov * 1.4 * 1.3; // proxy razoavel: freq 1.4 lifetime 1.3
      const payback = ltvPredictive > 0 ? cac / (ltvPredictive / 12) : 0;

      return {
        market, period: range, source: "BQ" as const,
        net_revenue: netRevenue,
        gross_revenue: grossRev,
        ad_spend: adSpend,
        marketing_efficiency: marketingEfficiency,
        contribution_margin: contributionMargin,
        contribution_margin_pct: contributionMarginPct,
        burn_rate_pct: burnRatePct,
        payback_period_months: payback,
        cac,
        ltv_predictive: ltvPredictive,
        channels,
      };
    } catch (err) {
      console.error("executive query failed:", err);
      return { market, period: range, source: "Mock" as const, ...MOCK[market] };
    }
  });
}

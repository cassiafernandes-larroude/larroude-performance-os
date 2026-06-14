// SQL queries para BigQuery — mapeia cada KPI/gráfico do PDF de referência
// para uma query SQL no warehouse Larroude (project: larroude-data-prod)
//
// Granularidade dinâmica:
//   - 'day'   → uma barra por dia    (períodos: 7d, 14d, 28d)
//   - 'week'  → uma barra por semana (período: 3M)
//   - 'month' → uma barra por mês    (períodos: 6M, 12M)
//
// Tabelas-chave:
//   - gold_sales.daily_sales_summary       (gross_sales, discounts, orders, AOV, units)
//   - gold_sales.returns_daily             (returns por dia)
//   - gold_sales.customer_acquisition_cost (CAC, CPO, new_customers)
//   - gold.all_channels_daily              (spend, impressions, clicks, ROAS, CPM, CPC, CTR, reach, frequency)

import { runQuery } from './bigquery';
import type { Granularity, Market } from './types';

// Timezone Shopify (alinhado ao admin oficial)
// US: America/New_York | BR: America/Sao_Paulo
const TZ: Record<Market, string> = {
  US: 'America/New_York',
  BR: 'America/Sao_Paulo',
};

// ----- Filtros de exclusao por requisicao da Cassia -----
// 1) Tags B2B / wholesale / marketplace / redo (na order OU no customer)
// 2) Orders com total_price acima do cap por mercado (US > $30k, BR > R$25k)
//    Pedidos acima desse valor sao tipicamente atacado/marketplace/redo
// 3) BR: PIX nao-pago (financial_status IN pending/expired/authorized) — Cassia 2026-06-14
const MAX_ORDER_VALUE: Record<Market, number> = { US: 30000, BR: 25000 };
const EXCLUDED_TAGS_REGEX = 'b2b|wholesale|marketplace|redo';

function shopifyOrderFilters(market: Market, alias = ''): string {
  const a = alias ? `${alias}.` : '';
  // Cassia 2026-06-14: BR exclui PIX pendente/expired/authorized (DTC = apenas pagas)
  const pixFilter = market === 'BR'
    ? `AND ${a}financial_status NOT IN ('pending','expired','authorized')`
    : '';
  return `
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(${a}tags, '')), r'${EXCLUDED_TAGS_REGEX}')
    AND (JSON_VALUE(${a}customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(${a}customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}'))
    AND CAST(${a}total_price AS NUMERIC) < ${MAX_ORDER_VALUE[market]}
    ${pixFilter}`;
}

// Para gold_sales.* store usa 'US' / 'BR' uppercase
// Para gold.all_channels_daily market usa 'us' / 'br' lowercase
//
// IMPORTANTE: Meta Ads BR é cobrado em USD. Para mostrar em BRL no dashboard BR,
// multiplicamos spend de Meta por avg_rate_brl_usd do mês.

/**
 * Retorna a expressão SQL para spend convertido para moeda local.
 * - US: spend (já em USD)
 * - BR: Meta Ads spend × FX (USD→BRL); Google Ads já em BRL
 */
function spendExprFor(market: Market): string {
  if (market === 'US') return 'spend';
  // BR: Meta Ads em USD precisa ser convertido. Join com fx por mês.
  return `(CASE WHEN LOWER(channel) LIKE 'meta%' THEN spend * IFNULL(fx_rate, 5.0) ELSE spend END)`;
}

/** JOIN com fx_rates_monthly para BR — USD→BRL por mês */
function fxJoin(market: Market, dateCol: string): string {
  if (market === 'US') return '';
  return `LEFT JOIN (
    SELECT month, avg_rate_brl_usd AS fx_rate
    FROM \`larroude-data-prod.gold.fx_rates_monthly\`
  ) fx ON fx.month = FORMAT_DATE('%Y-%m', ${dateCol})`;
}

/**
 * Retorna a expressão SQL DATE_TRUNC para a granularidade desejada.
 * - day   → a própria coluna
 * - week  → segunda-feira da semana ISO
 * - month → primeiro dia do mês
 */
function truncExpr(dateColumn: string, granularity: Granularity): string {
  if (granularity === 'week') return `DATE_TRUNC(${dateColumn}, WEEK(MONDAY))`;
  if (granularity === 'month') return `DATE_TRUNC(${dateColumn}, MONTH)`;
  return dateColumn;
}

// --------------------------------------------------------------------------
// KPI principal — agrega métricas no intervalo [start, end]
// (não depende de granularidade — é um único valor agregado)
// --------------------------------------------------------------------------
export async function queryAggregatedKpis(market: Market, start: string, end: string) {
  // Validado contra Shopify oficial (98%+ match): usar stg_shopify direto
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const marketLower = market.toLowerCase();
  const sql = `
    WITH
    sales AS (
      SELECT
        SUM(CAST(total_line_items_price AS NUMERIC)) AS gross_sales,
        SUM(CAST(total_discounts AS NUMERIC)) AS discounts,
        SUM(CAST(total_price AS NUMERIC)) AS order_revenue,
        SUM(CAST(total_tax AS NUMERIC)) AS tax,
        COUNT(*) AS orders
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
        AND financial_status NOT IN ('voided','refunded') ${shopifyOrderFilters(market)}
    ),
    units_t AS (
      SELECT SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64)) AS units
      FROM \`larroude-data-prod.${dataset}.orders\` o,
           UNNEST(JSON_QUERY_ARRAY(line_items)) li
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided','refunded') ${shopifyOrderFilters(market, 'o')}
    ),
    refunds_raw AS (
      SELECT
        DATE(created_at, '${TZ[market]}') AS d,
        (SELECT SUM(CAST(JSON_VALUE(t,'$.amount') AS NUMERIC))
         FROM UNNEST(JSON_QUERY_ARRAY(transactions)) t
         WHERE JSON_VALUE(t,'$.kind') = 'refund') AS refund_amount
      FROM \`larroude-data-prod.${dataset}.order_refunds\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
    ),
    returns_t AS (
      SELECT
        SUM(IFNULL(refund_amount, 0)) AS refund_value,
        COUNT(*) AS refund_orders
      FROM refunds_raw
    ),
    ads AS (
      SELECT
        SUM(${market === 'BR'
          ? `CASE WHEN LOWER(ad.channel) LIKE 'meta%' THEN ad.spend * IFNULL(fx.avg_rate_brl_usd, 5.0) ELSE ad.spend END`
          : 'ad.spend'}) AS spend,
        -- Breakdown Meta US: Larroudé regular vs PRE-ORDER (separa por campaign_name)
        SUM(IF(LOWER(ad.channel) LIKE 'meta%' AND NOT REGEXP_CONTAINS(LOWER(ad.campaign_name), r'pre[\\s_-]?order|preorder'), ad.spend, 0)) AS meta_spend_main,
        SUM(IF(LOWER(ad.channel) LIKE 'meta%' AND REGEXP_CONTAINS(LOWER(ad.campaign_name), r'pre[\\s_-]?order|preorder'), ad.spend, 0)) AS meta_spend_preorder,
        SUM(IF(LOWER(ad.channel) LIKE 'google%', ad.spend, 0)) AS google_spend,
        SUM(ad.impressions) AS impressions,
        SUM(ad.clicks) AS clicks,
        SUM(ad.reach) AS reach,
        SUM(ad.conversions) AS pixel_purchases,
        SUM(ad.conversion_value) AS pixel_revenue
      FROM \`larroude-data-prod.gold.all_channels_daily\` ad
      ${market === 'BR' ? `LEFT JOIN \`larroude-data-prod.gold.fx_rates_monthly\` fx ON fx.month = FORMAT_DATE('%Y-%m', ad.date)` : ''}
      WHERE LOWER(ad.market) = @market_lower
        AND ad.date BETWEEN @start AND @end
    ),
    first_order_per_customer AS (
      SELECT JSON_VALUE(customer, '$.id') AS cust_id,
             MIN(DATE(created_at, '${TZ[market]}')) AS first_dt
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE customer IS NOT NULL AND financial_status NOT IN ('voided','refunded') ${shopifyOrderFilters(market)}
      GROUP BY cust_id
    ),
    customer_split AS (
      SELECT
        COUNTIF(DATE(o.created_at) = fo.first_dt) AS new_customer_orders,
        COUNTIF(DATE(o.created_at) != fo.first_dt) AS returning_customer_orders,
        SUM(IF(DATE(o.created_at) = fo.first_dt, CAST(o.total_price AS NUMERIC), 0)) AS new_customer_revenue,
        SUM(IF(DATE(o.created_at) != fo.first_dt, CAST(o.total_price AS NUMERIC), 0)) AS returning_customer_revenue
      FROM \`larroude-data-prod.${dataset}.orders\` o
      JOIN first_order_per_customer fo ON JSON_VALUE(o.customer, '$.id') = fo.cust_id
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided','refunded') ${shopifyOrderFilters(market, 'o')}
    ),
    cac AS (
      SELECT new_customer_orders AS new_customers FROM customer_split
    )
    SELECT
      s.gross_sales,
      s.discounts,
      s.tax,
      s.order_revenue,
      -- Total Sales = Order Revenue (total_price) − Refunds
      -- Equivale a Shopify "Total Sales" = Gross − Discounts − Returns + Tax + Shipping
      (s.order_revenue - IFNULL(r.refund_value, 0)) AS total_sales,
      s.orders,
      u.units,
      SAFE_DIVIDE(s.order_revenue, NULLIF(s.orders, 0)) AS aov,
      r.refund_value,
      r.refund_orders,
      SAFE_DIVIDE(r.refund_value, NULLIF(s.order_revenue, 0)) AS return_rate,
      a.spend,
      a.google_spend,
      a.meta_spend_main,
      a.meta_spend_preorder,
      a.impressions,
      a.clicks,
      a.reach,
      a.pixel_purchases,
      a.pixel_revenue,
      SAFE_DIVIDE(a.clicks, NULLIF(a.impressions, 0)) AS ctr,
      SAFE_DIVIDE(a.spend, NULLIF(a.clicks, 0)) AS cpc,
      SAFE_DIVIDE(a.spend, NULLIF(a.impressions, 0)) * 1000 AS cpm,
      SAFE_DIVIDE(a.impressions, NULLIF(a.reach, 0)) AS frequency,
      SAFE_DIVIDE(a.pixel_revenue, NULLIF(a.spend, 0)) AS roas_pixel,
      SAFE_DIVIDE(s.gross_sales, NULLIF(a.spend, 0)) AS roas_gross,
      SAFE_DIVIDE(s.order_revenue, NULLIF(a.spend, 0)) AS roas_order,
      SAFE_DIVIDE(s.order_revenue - IFNULL(r.refund_value, 0), NULLIF(a.spend, 0)) AS roas_total,
      SAFE_DIVIDE(a.spend, NULLIF(s.orders, 0)) AS cpo,
      SAFE_DIVIDE(a.spend, NULLIF(a.pixel_purchases, 0)) AS cpa,
      c.new_customers,
      SAFE_DIVIDE(a.spend, NULLIF(c.new_customers, 0)) AS cac,
      cs.new_customer_orders,
      cs.returning_customer_orders,
      cs.new_customer_revenue,
      cs.returning_customer_revenue
    FROM sales s, units_t u, returns_t r, ads a, cac c, customer_split cs
  `;
  const rows = await runQuery<any>(sql, { market_lower: marketLower, start, end });
  return rows[0] ?? {};
}

// --------------------------------------------------------------------------
// Séries — Sales / Discounts / Orders / Units (agrupado por granularidade)
// --------------------------------------------------------------------------
export async function queryDailySales(market: Market, start: string, end: string, granularity: Granularity = 'day') {
  // Validado contra dashboard Shopify oficial: 98%+ match
  // gold_sales.daily_sales_summary tem dados inflados (~175%) — usar stg_shopify.orders direto
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const bucket = granularity === 'week' ? 'DATE_TRUNC(d, WEEK(MONDAY))'
                : granularity === 'month' ? 'DATE_TRUNC(d, MONTH)'
                : 'd';
  const bucketCol = bucket === 'd' ? 'sd.d' : bucket.replace(/d\b/g, 'sd.d');
  const sql = `
    WITH sales_daily AS (
      SELECT
        DATE(created_at, '${TZ[market]}') AS d,
        COUNT(*) AS orders,
        SUM(CAST(total_line_items_price AS NUMERIC)) AS gross_sales,
        SUM(CAST(total_discounts AS NUMERIC)) AS discounts,
        SUM(CAST(total_price AS NUMERIC)) AS order_revenue,
        SUM(CAST(total_tax AS NUMERIC)) AS tax
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
        AND financial_status NOT IN ('voided','refunded') ${shopifyOrderFilters(market)}
      GROUP BY d
    ),
    units_daily AS (
      SELECT DATE(o.created_at) AS d,
             SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64)) AS units
      FROM \`larroude-data-prod.${dataset}.orders\` o,
           UNNEST(JSON_QUERY_ARRAY(line_items)) li
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided','refunded') ${shopifyOrderFilters(market, 'o')}
      GROUP BY d
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', ${bucketCol}) AS date,
      SUM(sd.orders) AS orders,
      SUM(sd.gross_sales) AS gross_sales,
      SUM(sd.discounts) AS discounts,
      SUM(sd.order_revenue) AS order_revenue,
      SUM(sd.tax) AS tax,
      SUM(IFNULL(u.units, 0)) AS units
    FROM sales_daily sd
    LEFT JOIN units_daily u ON u.d = sd.d
    GROUP BY date
    ORDER BY date
  `;
  return runQuery<any>(sql, { start, end });
}

export async function queryDailyReturns(market: Market, start: string, end: string, granularity: Granularity = 'day') {
  // Returns reais via stg_shopify.order_refunds (transactions kind='refund')
  // Validado contra Shopify oficial: 96% match
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const bucket = granularity === 'week' ? 'DATE_TRUNC(d, WEEK(MONDAY))'
                : granularity === 'month' ? 'DATE_TRUNC(d, MONTH)'
                : 'd';
  const sql = `
    WITH refunds AS (
      SELECT
        DATE(created_at, '${TZ[market]}') AS d,
        (SELECT SUM(CAST(JSON_VALUE(t,'$.amount') AS NUMERIC))
         FROM UNNEST(JSON_QUERY_ARRAY(transactions)) t
         WHERE JSON_VALUE(t,'$.kind') = 'refund') AS refund_amount
      FROM \`larroude-data-prod.${dataset}.order_refunds\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', ${bucket}) AS date,
      SUM(IFNULL(refund_amount, 0)) AS refund_value,
      COUNT(*) AS refund_orders
    FROM refunds
    GROUP BY date
    ORDER BY date
  `;
  return runQuery<any>(sql, { start, end });
}

// --------------------------------------------------------------------------
// Séries — Marketing (spend, impressions, clicks, reach, conversions, conversion_value)
// --------------------------------------------------------------------------
export async function queryDailyAds(market: Market, start: string, end: string, granularity: Granularity = 'day') {
  const bucket = truncExpr('ad.date', granularity);
  const spendExpr = market === 'BR'
    ? `CASE WHEN LOWER(ad.channel) LIKE 'meta%' THEN ad.spend * IFNULL(fx.avg_rate_brl_usd, 5.0) ELSE ad.spend END`
    : 'ad.spend';
  const fxJoinSql = market === 'BR'
    ? `LEFT JOIN \`larroude-data-prod.gold.fx_rates_monthly\` fx ON fx.month = FORMAT_DATE('%Y-%m', ad.date)`
    : '';
  const sql = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', ${bucket}) AS date,
      SUM(${spendExpr}) AS spend,
      SUM(ad.impressions) AS impressions,
      SUM(ad.clicks) AS clicks,
      SUM(ad.reach) AS reach,
      SUM(ad.conversions) AS pixel_purchases,
      SUM(ad.conversion_value) AS pixel_revenue
    FROM \`larroude-data-prod.gold.all_channels_daily\` ad
    ${fxJoinSql}
    WHERE LOWER(ad.market) = @market_lower
      AND ad.date BETWEEN @start AND @end
    GROUP BY date
    ORDER BY date
  `;
  return runQuery<any>(sql, { market_lower: market.toLowerCase(), start, end });
}

// --------------------------------------------------------------------------
// Séries — CAC / CPO / New customers
// Lógica alinhada ao dashboard CAC oficial (larroude-cac-dashboard-app):
//   Spend total  = Meta + Google (Meta BR convertido USD→BRL)
//   Novos clientes = orders Shopify cujo customer.id aparece pela 1ª vez
//                    (primeira data de compra == data da order)
//   Pedidos      = orders Shopify (não cancelados)
//   CAC          = Spend / Novos clientes
//   CPO          = Spend / Pedidos
// --------------------------------------------------------------------------
export async function queryDailyCac(market: Market, start: string, end: string, granularity: Granularity = 'day') {
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const bucket = granularity === 'week' ? 'DATE_TRUNC(d, WEEK(MONDAY))'
                : granularity === 'month' ? 'DATE_TRUNC(d, MONTH)'
                : 'd';
  const spendExpr = market === 'BR'
    ? `CASE WHEN LOWER(ad.channel) LIKE 'meta%' THEN ad.spend * IFNULL(fx.avg_rate_brl_usd, 5.0) ELSE ad.spend END`
    : 'ad.spend';
  const fxJoinSql = market === 'BR'
    ? `LEFT JOIN \`larroude-data-prod.gold.fx_rates_monthly\` fx ON fx.month = FORMAT_DATE('%Y-%m', ad.date)`
    : '';
  const sql = `
    WITH
    first_order_per_customer AS (
      SELECT JSON_VALUE(customer, '$.id') AS customer_id,
             MIN(DATE(created_at, '${TZ[market]}')) AS first_order_date
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE customer IS NOT NULL
        AND financial_status NOT IN ('voided', 'refunded') ${shopifyOrderFilters(market)}
      GROUP BY customer_id
    ),
    new_customers_daily AS (
      SELECT DATE(o.created_at) AS d, COUNT(*) AS new_customers
      FROM \`larroude-data-prod.${dataset}.orders\` o
      JOIN first_order_per_customer fo
        ON JSON_VALUE(o.customer, '$.id') = fo.customer_id
       AND DATE(o.created_at) = fo.first_order_date
      WHERE DATE(o.created_at) BETWEEN @start AND @end
        AND o.financial_status NOT IN ('voided', 'refunded') ${shopifyOrderFilters(market, 'o')}
      GROUP BY d
    ),
    orders_daily AS (
      SELECT DATE(created_at, '${TZ[market]}') AS d, COUNT(*) AS orders
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
        AND financial_status NOT IN ('voided', 'refunded') ${shopifyOrderFilters(market)}
      GROUP BY d
    ),
    spend_daily AS (
      SELECT ad.date AS d, SUM(${spendExpr}) AS spend
      FROM \`larroude-data-prod.gold.all_channels_daily\` ad
      ${fxJoinSql}
      WHERE LOWER(ad.market) = @market_lower
        AND ad.date BETWEEN @start AND @end
      GROUP BY ad.date
    ),
    joined AS (
      SELECT
        COALESCE(s.d, o.d, n.d) AS d,
        IFNULL(s.spend, 0) AS spend,
        IFNULL(o.orders, 0) AS orders,
        IFNULL(n.new_customers, 0) AS new_customers
      FROM spend_daily s
      FULL OUTER JOIN orders_daily o USING (d)
      FULL OUTER JOIN new_customers_daily n USING (d)
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', ${bucket}) AS date,
      SUM(spend) AS spend,
      SUM(orders) AS orders,
      SUM(new_customers) AS new_customers,
      SAFE_DIVIDE(SUM(spend), NULLIF(SUM(new_customers), 0)) AS cac,
      SAFE_DIVIDE(SUM(spend), NULLIF(SUM(orders), 0)) AS cpo
    FROM joined
    GROUP BY date
    ORDER BY date
  `;
  return runQuery<any>(sql, { market_lower: market.toLowerCase(), start, end });
}

// --------------------------------------------------------------------------
// Séries — Returns daily (taxa de retorno por bucket)
// --------------------------------------------------------------------------
export async function queryReturnRateSeries(market: Market, start: string, end: string, granularity: Granularity = 'day') {
  const bucket = truncExpr('return_date', granularity);
  const sql = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', ${bucket}) AS date,
      SAFE_DIVIDE(SUM(full_refund_value), NULLIF(SUM(daily_total_sales), 0)) AS return_rate
    FROM \`larroude-data-prod.gold_sales.returns_daily\`
    WHERE store = @store AND return_date BETWEEN @start AND @end
    GROUP BY date
    ORDER BY date
  `;
  return runQuery<any>(sql, { store: market, start, end });
}

// --------------------------------------------------------------------------
// Top campanhas Meta Ads — para tabela e ranking ROAS
// --------------------------------------------------------------------------
export async function queryCampaigns(market: Market, start: string, end: string) {
  // Inclui last_spend_date para identificar campanhas REALMENTE ATIVAS
  // (com spend nos últimos 3 dias do período). Campanhas pausadas há semanas
  // somam spend no período mas não estão ativas hoje.
  // Meta Ads BR é cobrado em USD; converte para BRL via fx_rates_monthly
  const spendExpr = market === 'BR'
    ? `ad.spend * IFNULL(fx.avg_rate_brl_usd, 5.0)`
    : 'ad.spend';
  const revenueExpr = market === 'BR'
    ? `ad.conversion_value * IFNULL(fx.avg_rate_brl_usd, 5.0)`
    : 'ad.conversion_value';
  const fxJoinSql = market === 'BR'
    ? `LEFT JOIN \`larroude-data-prod.gold.fx_rates_monthly\` fx ON fx.month = FORMAT_DATE('%Y-%m', ad.date)`
    : '';
  // Inclui Meta E Google na MESMA query — diferenciando por platform
  const sql = `
    SELECT
      ad.campaign_name AS campaign,
      CASE WHEN LOWER(ad.channel) LIKE 'meta%' THEN 'Meta'
           WHEN LOWER(ad.channel) LIKE 'google%' THEN 'Google'
           ELSE 'Outro' END AS platform,
      SUM(${spendExpr}) AS total_spend,
      SUM(ad.conversions) AS total_purchases,
      SUM(${revenueExpr}) AS total_conversion_value,
      SAFE_DIVIDE(SUM(${revenueExpr}), NULLIF(SUM(${spendExpr}), 0)) AS roas,
      SAFE_DIVIDE(SUM(${spendExpr}), NULLIF(SUM(ad.conversions), 0)) AS cpo,
      SUM(ad.link_clicks) AS total_link_clicks,
      SUM(ad.outbound_clicks) AS total_outbound_clicks,
      SUM(ad.impressions) AS total_impressions,
      MAX(IF(ad.spend > 0, ad.date, NULL)) AS last_spend_date
    FROM \`larroude-data-prod.gold.all_channels_daily\` ad
    ${fxJoinSql}
    WHERE LOWER(ad.market) = @market_lower
      AND (LOWER(ad.channel) LIKE 'meta%' OR LOWER(ad.channel) LIKE 'google%')
      AND ad.date BETWEEN @start AND @end
    GROUP BY ad.campaign_name, platform
    HAVING total_spend > 0
    ORDER BY total_spend DESC
    LIMIT 200
  `;
  const rows = await runQuery<any>(sql, { market_lower: market.toLowerCase(), start, end });
  return rows.map((r: any) => ({
    campaign: r.campaign,
    platform: r.platform,
    spend: r.total_spend,
    purchases: r.total_purchases,
    conversion_value: r.total_conversion_value,
    roas: r.roas,
    cpo: r.cpo,
    link_clicks: r.total_link_clicks,
    outbound_clicks: r.total_outbound_clicks,
    impressions: r.total_impressions,
    last_spend_date: r.last_spend_date,
  }));
}

// --------------------------------------------------------------------------
// Tráfego — Sessões (Shopify orders + abandoned_checkouts como proxy de sessões)
// Classifica em Total / Direct / Organic baseado em referring_site
// --------------------------------------------------------------------------
export async function queryDailySessions(market: Market, start: string, end: string, granularity: Granularity = 'day') {
  const bucket = granularity === 'week' ? 'DATE_TRUNC(d, WEEK(MONDAY))' : granularity === 'month' ? 'DATE_TRUNC(d, MONTH)' : 'd';
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const sql = `
    WITH
    sessions_union AS (
      -- Orders concluídos: cada order = uma sessão que converteu
      SELECT
        DATE(created_at, '${TZ[market]}') AS d,
        LOWER(IFNULL(referring_site, '')) AS ref
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
      UNION ALL
      -- Abandoned checkouts: cada checkout abandonado = uma sessão engajada
      SELECT
        DATE(created_at, '${TZ[market]}') AS d,
        LOWER(IFNULL(referring_site, '')) AS ref
      FROM \`larroude-data-prod.${dataset}.abandoned_checkouts\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
    ),
    classified AS (
      SELECT
        d,
        CASE
          WHEN ref = '' OR ref LIKE '%larroude.com%' THEN 'direct'
          WHEN REGEXP_CONTAINS(ref, r'google\\.|bing\\.|yahoo\\.|duckduckgo\\.|ecosia\\.') AND NOT REGEXP_CONTAINS(ref, r'utm_medium=cpc|utm_medium=paid') THEN 'organic'
          ELSE 'referral'
        END AS source_type
      FROM sessions_union
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', ${bucket}) AS date,
      COUNT(*) AS sessions,
      COUNTIF(source_type = 'direct') AS direct_sessions,
      COUNTIF(source_type = 'organic') AS organic_sessions,
      COUNTIF(source_type = 'referral') AS referral_sessions
    FROM classified
    GROUP BY date
    ORDER BY date
  `;
  return runQuery<any>(sql, { start, end });
}

// --------------------------------------------------------------------------
// Receita por canal — UTM do Shopify (landing_site)
// Canais alinhados ao PDF de referência: Sem UTM/Direto, Meta Ads, Klaviyo Email,
// SMS Attentive, Awin Affiliate, ShopMy, Orgânico Social (IG)
// --------------------------------------------------------------------------
export async function queryChannelMix(market: Market, start: string, end: string) {
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const sql = `
    WITH parsed AS (
      SELECT
        DATE(created_at, '${TZ[market]}') AS d,
        CAST(total_price AS NUMERIC) AS revenue,
        LOWER(IFNULL(landing_site, '')) AS landing,
        LOWER(IFNULL(referring_site, '')) AS referrer
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
        AND financial_status NOT IN ('voided', 'refunded') ${shopifyOrderFilters(market)}
    ),
    classified AS (
      SELECT
        revenue,
        CASE
          -- ============= OWNED CHANNELS (highest priority - explicit UTMs) =============
          -- Klaviyo Email (owned channel)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=klaviyo') THEN 'Klaviyo Email'
          -- SMS Attentive (owned channel)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=attentive|utm_medium=sms') THEN 'SMS Attentive'

          -- ============= AFFILIATE / CREATOR CHANNELS =============
          -- Affiliates/Creators (UTMs reais descobertos via BQ — REGRAS-LARROUDE-OS sec.4):
          -- Awin: APENAS utm_source=awin (utm_medium=affiliate pode pegar ShopMy)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=awin') OR REGEXP_CONTAINS(referrer, r'utm_source=awin') THEN 'Awin Affiliate'
          -- ShopMy: utm_source=shopmy (case-insensitive já garantido por LOWER)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=shopmy') OR REGEXP_CONTAINS(referrer, r'utm_source=shopmy') THEN 'ShopMy'
          -- Agent.shop: utm_source=agent-shop (com hifen — BR apenas)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=agent-shop') OR REGEXP_CONTAINS(referrer, r'utm_source=agent-shop') THEN 'Agent.shop'

          -- ============= PAID ADS =============
          -- Meta Ads paid (UTMs explicitos OU referrer social + landing com fbclid/paid medium)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(meta|facebook|ig_paid|ig_ads|fb_ads|fb|instagram_paid|fb_paid)') THEN 'Meta Ads'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(instagram|facebook|meta|fb|ig)') AND REGEXP_CONTAINS(landing, r'utm_medium=(paid|cpc|cpm|social_paid|paidsocial|paid_social)') THEN 'Meta Ads'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(instagram|facebook|meta|fb|ig)') AND NOT REGEXP_CONTAINS(landing, r'utm_medium=') THEN 'Meta Ads'
          -- Google Ads paid
          WHEN REGEXP_CONTAINS(landing, r'utm_source=google.*utm_medium=cpc|gclid=') THEN 'Google Ads'
          -- Criteo (paid retargeting)
          WHEN REGEXP_CONTAINS(landing, r'criteo') OR REGEXP_CONTAINS(referrer, r'criteo') THEN 'Criteo'

          -- ============= ORGANIC =============
          -- Link in bio / linktree (organic social)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(linktree|linkinbio|link_in_bio|bio|lnk\.bio)') THEN 'Orgânico Social'
          -- Orgânico Search (Shopify-style): referring site = search engine SEM gclid (paid)
          WHEN REGEXP_CONTAINS(referrer, r'google\.|bing\.|duckduckgo|yahoo\.com/search|baidu\.|yandex\.|ecosia\.|qwant\.')
            AND NOT REGEXP_CONTAINS(landing, r'gclid=|utm_medium=(cpc|paid)') THEN 'Orgânico Search'
          -- Orgânico Social: referring site = social network SEM fbclid (paid)
          WHEN REGEXP_CONTAINS(referrer, r'instagram\.|facebook\.|tiktok\.|pinterest\.|youtube\.|twitter\.|t\.co|threads\.|x\.com')
            AND NOT REGEXP_CONTAINS(landing, r'fbclid=|gclid=|utm_medium=(cpc|paid)') THEN 'Orgânico Social'
          -- Tiktok organico (caso especial)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(tiktok)') AND NOT REGEXP_CONTAINS(landing, r'utm_medium=(cpc|paid)') THEN 'Orgânico Social'
          -- Sem UTM / Direto: sem utm_source E sem referrer reconhecido
          WHEN NOT REGEXP_CONTAINS(landing, r'utm_source=') THEN 'Sem UTM / Direto'
          ELSE 'Outros'
        END AS channel
      FROM parsed
    )
    SELECT
      channel,
      SUM(revenue) AS revenue,
      COUNT(*) AS orders
    FROM classified
    GROUP BY channel
    ORDER BY revenue DESC
  `;
  return runQuery<any>(sql, { start, end });
}

// --------------------------------------------------------------------------
// Funil REAL Shopify — abandoned_checkouts + orders
// Retorna: { abandoned_checkouts, completed_orders, reached_checkout }
// - reached_checkout = abandoned + orders (todos que chegaram à página de checkout)
// - completed_orders = orders real (purchases)
// --------------------------------------------------------------------------
export async function queryShopifyFunnel(market: Market, start: string, end: string) {
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const sql = `
    WITH atc AS (
      SELECT COUNT(*) AS abandoned_count
      FROM \`larroude-data-prod.${dataset}.abandoned_checkouts\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
    ),
    orders AS (
      SELECT COUNT(*) AS orders_count
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
        AND financial_status NOT IN ('voided', 'refunded') ${shopifyOrderFilters(market)}
    )
    SELECT
      atc.abandoned_count,
      orders.orders_count,
      (atc.abandoned_count + orders.orders_count) AS reached_checkout
    FROM atc, orders
  `;
  const rows = await runQuery<any>(sql, { start, end });
  return rows[0] ?? { abandoned_count: 0, orders_count: 0, reached_checkout: 0 };
}

// --------------------------------------------------------------------------
// Receita por canal POR DIA / semana / mês (mesma classificação UTM)
// Retorna [{ bucket, channel, revenue }]
// --------------------------------------------------------------------------
export async function queryChannelMixDaily(market: Market, start: string, end: string, granularity: Granularity = 'day') {
  const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
  const bucketExpr = granularity === 'week' ? `DATE_TRUNC(d, WEEK(MONDAY))`
                   : granularity === 'month' ? `DATE_TRUNC(d, MONTH)`
                   : `d`;
  const sql = `
    WITH parsed AS (
      SELECT
        DATE(created_at, '${TZ[market]}') AS d,
        CAST(total_price AS NUMERIC) AS revenue,
        LOWER(IFNULL(landing_site, '')) AS landing,
        LOWER(IFNULL(referring_site, '')) AS referrer
      FROM \`larroude-data-prod.${dataset}.orders\`
      WHERE DATE(created_at, '${TZ[market]}') BETWEEN @start AND @end
        AND financial_status NOT IN ('voided', 'refunded') ${shopifyOrderFilters(market)}
    ),
    classified AS (
      SELECT
        d,
        revenue,
        CASE
          -- OWNED CHANNELS
          WHEN REGEXP_CONTAINS(landing, r'utm_source=klaviyo') THEN 'Klaviyo Email'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=attentive|utm_medium=sms') THEN 'SMS Attentive'
          -- AFFILIATE / CREATOR
          WHEN REGEXP_CONTAINS(landing, r'utm_source=awin|utm_medium=affiliate') THEN 'Awin Affiliate'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=shopmy') THEN 'ShopMy'
          WHEN REGEXP_CONTAINS(landing, r'agent[._-]?shop|utm_source=agent') OR REGEXP_CONTAINS(referrer, r'agent[._-]?shop') THEN 'Agent.shop'
          -- PAID ADS
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(meta|facebook|ig_paid|ig_ads|fb_ads|fb|instagram_paid|fb_paid)') THEN 'Meta Ads'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(instagram|facebook|meta|fb|ig)') AND REGEXP_CONTAINS(landing, r'utm_medium=(paid|cpc|cpm|social_paid|paidsocial|paid_social)') THEN 'Meta Ads'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(instagram|facebook|meta|fb|ig)') AND NOT REGEXP_CONTAINS(landing, r'utm_medium=') THEN 'Meta Ads'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=google.*utm_medium=cpc|gclid=') THEN 'Google Ads'
          WHEN REGEXP_CONTAINS(landing, r'criteo') OR REGEXP_CONTAINS(referrer, r'criteo') THEN 'Criteo'
          -- ORGANIC (Shopify-style: referring_site search engines / social networks without paid params)
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(linktree|linkinbio|link_in_bio|bio|lnk\.bio)') THEN 'Orgânico Social'
          WHEN REGEXP_CONTAINS(referrer, r'google\.|bing\.|duckduckgo|yahoo\.com/search|baidu\.|yandex\.|ecosia\.|qwant\.')
            AND NOT REGEXP_CONTAINS(landing, r'gclid=|utm_medium=(cpc|paid)') THEN 'Orgânico Search'
          WHEN REGEXP_CONTAINS(referrer, r'instagram\.|facebook\.|tiktok\.|pinterest\.|youtube\.|twitter\.|t\.co|threads\.|x\.com')
            AND NOT REGEXP_CONTAINS(landing, r'fbclid=|gclid=|utm_medium=(cpc|paid)') THEN 'Orgânico Social'
          WHEN REGEXP_CONTAINS(landing, r'utm_source=(tiktok)') AND NOT REGEXP_CONTAINS(landing, r'utm_medium=(cpc|paid)') THEN 'Orgânico Social'
          -- DIRECT (no UTM, no recognized referrer)
          WHEN NOT REGEXP_CONTAINS(landing, r'utm_source=') THEN 'Sem UTM / Direto'
          ELSE 'Outros'
        END AS channel
      FROM parsed
    )
    SELECT
      ${bucketExpr} AS bucket,
      channel,
      SUM(revenue) AS revenue
    FROM classified
    GROUP BY bucket, channel
    ORDER BY bucket, channel
  `;
  return runQuery<any>(sql, { start, end });
}

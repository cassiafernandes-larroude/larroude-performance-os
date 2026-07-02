/**
 * CAC queries — usa as MESMAS funcoes do Main Dashboard pra garantir
 * numeros 100% identicos:
 *
 *   - new_customers / orders: queryDailyCac (BQ stg_shopify) — TZ por market
 *   - spend Meta: Meta Graph API direta (META_ACCESS_TOKEN do .env)
 *   - spend Google: Supermetrics (queryGoogleAdsViaSupermetrics)
 *
 * Mesmo padrao do dashboard-service.ts: Supermetrics/API-FIRST,
 * BQ all_channels_daily como fallback.
 */

import { runQuery } from './bigquery';
import { queryDailyCac } from '@/lib/main-dashboard/queries';
import {
  queryGoogleAdsViaSupermetrics,
  queryGoogleAdsTotalViaSupermetrics,
} from '@/lib/main-dashboard/supermetrics';
import { queryMetaAdsDaily } from '@/lib/main-dashboard/meta-ads';
import type { Market as MainMarket } from '@/lib/main-dashboard/types';
import { getMetaSpendAdjustmentByDay } from '@/lib/shared/meta-adjustments';
// Cassia 2026-06-17: filtros DTC vem da fonte unica (regra de ouro)
import { EXCLUDED_TAGS_REGEX, DTC_MAX_ORDER_VALUE as MAX_ORDER_VALUE, excludeExchangesSQL } from '@/lib/shared/dtc-filters';
// Cassia 2026-06-14: REGRA — spend total = Meta+Google+Klaviyo+Attentive+Criteo+Agent.shop+Awin+ShopMy
import { computeTotalSpend, getPercentRevenueCostsFromBQ } from '@/lib/channel-costs-bq';
import { getFixedToolsCostInRange } from '@/lib/channel-costs';
import type {
  DailyPoint,
  DataSourceMeta,
  KpiSummary,
  Market,
  MonthlyPoint,
  ProductCacResult,
} from './queries';

/**
 * Spend strategy (Cassia's directive):
 *   - Meta:   Meta Graph API direct (PRIMARY) via META_ACCESS_TOKEN.
 *             Supermetrics ONLY as fallback for dates the API didn't return.
 *   - Google: ALWAYS Supermetrics (no fallback).
 *
 * Retorna { total: Map<date, sum>, google: total, meta: total }.
 */
async function getSpendByDay(
  market: Market,
  startDate: string,
  endDate: string
): Promise<{ total: Map<string, number>; google: number; meta: number }> {
  // Normaliza qualquer formato de data pra ISO (Supermetrics as vezes retorna M/D/YYYY)
  // REGRA: REGRAS-LARROUDE-OS.md secao 15 — paridade KPI vs chart
  function normalizeISODate(raw: any): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  }

  // Google: SEMPRE Supermetrics (regra Cassia).
  // Usa a MESMA chamada que o Main Dashboard faz para garantir paridade total.
  // queryGoogleAdsTotalViaSupermetrics retorna { spend, clicks, ... } agregado;
  // queryGoogleAdsViaSupermetrics retorna rows daily.
  const [googleTotalResult, googleRows] = await Promise.all([
    queryGoogleAdsTotalViaSupermetrics(market as MainMarket, startDate, endDate).catch((err) => {
      console.error('[cac-bq] Google Total Supermetrics failed:', err);
      return { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 };
    }),
    queryGoogleAdsViaSupermetrics(market as MainMarket, startDate, endDate).catch((err) => {
      console.error('[cac-bq] Google Daily Supermetrics failed:', err);
      return [] as Array<{ date: string; spend: number }>;
    }),
  ]);
  console.log(
    `[cac-bq] Google Supermetrics ${market} ${startDate}..${endDate}:`,
    `total=$${googleTotalResult.spend.toFixed(0)}`,
    `daily_rows=${googleRows.length}`
  );

  // Meta: API direta — TODAS as 5 contas oficiais (US x3, BR x3 com FX USD->BRL)
  const apiMeta = await queryMetaAdsDaily(market as MainMarket, startDate, endDate)
    .then((rows) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const iso = normalizeISODate((r as any).date);
        if (!iso) continue;
        const v = Number((r as any).spend) || 0;
        map.set(iso, (map.get(iso) || 0) + v);
      }
      return map;
    })
    .catch((err) => {
      console.error('[cac-bq] Meta Graph API direct failed:', err);
      return new Map<string, number>();
    });

  // Google — total autoritativo de queryGoogleAdsTotalViaSupermetrics (= Main Dashboard).
  // googleByDay é usado pra distribuição diária no chart.
  const googleByDay = new Map<string, number>();
  let googleDailySum = 0;
  for (const r of googleRows) {
    const iso = normalizeISODate((r as any).date);
    if (!iso) continue;
    const v = Number(r.spend) || 0;
    googleByDay.set(iso, (googleByDay.get(iso) || 0) + v);
    googleDailySum += v;
  }
  let googleTotal = googleTotalResult.spend || googleDailySum;

  // Cassia 2026-06-17 (auditoria de convergencia): fallback BQ pro Google.
  // Supermetrics as vezes retorna 0 (falha) — o Main cai pro BQ (gold.all_channels_daily),
  // mas o CAC ficava com Google=0, divergindo do Main. Aqui replicamos o fallback BQ.
  if (googleTotal <= 0) {
    try {
      const bqRows = await runQuery<{ d: string; spend: number }>(
        `SELECT FORMAT_DATE('%Y-%m-%d', ad.date) AS d, SUM(IF(LOWER(ad.channel) LIKE 'google%', ad.spend, 0)) AS spend
         FROM \`larroude-data-prod.gold.all_channels_daily\` ad
         WHERE LOWER(ad.market) = @m AND ad.date BETWEEN @s AND @e
         GROUP BY d`,
        { m: market.toLowerCase(), s: startDate, e: endDate }
      );
      let bqGoogleSum = 0;
      for (const r of bqRows) {
        const v = Number(r.spend) || 0;
        if (v <= 0) continue;
        googleByDay.set(r.d, (googleByDay.get(r.d) || 0) + v);
        bqGoogleSum += v;
      }
      if (bqGoogleSum > 0) {
        googleTotal = bqGoogleSum;
        console.log(`[cac-bq] Google fallback BQ ${market}: $${bqGoogleSum.toFixed(0)}`);
      }
    } catch (err) {
      console.error('[cac-bq] Google BQ fallback failed:', err);
    }
  }

  // Meta — API direta + ajuste manual Set/25
  const metaByDay = new Map<string, number>(apiMeta);
  const adjByDay = getMetaSpendAdjustmentByDay(market as 'US' | 'BR', startDate, endDate);
  adjByDay.forEach((adjValue, date) => {
    metaByDay.set(date, (metaByDay.get(date) || 0) + adjValue);
  });
  let metaTotal = 0;
  metaByDay.forEach((v) => {
    metaTotal += v;
  });

  console.log(`[cac-bq spend ${market}] google_total=$${googleTotal.toFixed(0)} meta_total=$${metaTotal.toFixed(0)} google_rows=${googleRows.length}`);

  // Soma total por dia
  const total = new Map<string, number>();
  googleByDay.forEach((v, d) => total.set(d, (total.get(d) || 0) + v));
  metaByDay.forEach((v, d) => total.set(d, (total.get(d) || 0) + v));

  return { total, google: googleTotal, meta: metaTotal };
}

/**
 * Cassia 2026-06-14: REGRA — pra qualquer KPI total (não daily), use computeTotalSpend
 * que adiciona Klaviyo/Attentive/Criteo (fixed) + Agent.shop/Awin/ShopMy (% revenue).
 * Daily series mantém só Meta+Google (não dá pra distribuir tools no dia sem fonte).
 */
export async function getTotalSpendWithAllChannels(
  market: Market,
  startDate: string,
  endDate: string,
): Promise<number> {
  const sp = await getSpendByDay(market, startDate, endDate);
  const breakdown = await computeTotalSpend(market as MainMarket, startDate, endDate, sp.meta, sp.google);
  return breakdown.total;
}

/**
 * Daily series — new_customers via queryDailyCac (Main Dashboard) + spend mesclado.
 */
export async function getDailySeries(
  market: Market,
  startDate: string,
  endDate: string
): Promise<DailyPoint[]> {
  const [bqDaily, spend] = await Promise.all([
    queryDailyCac(market as MainMarket, startDate, endDate, 'day'),
    getSpendByDay(market, startDate, endDate),
  ]);

  // bqDaily: [{date, spend, orders, new_customers, cac, cpo}]
  // Cassia 2026-06-26: spend/CAC diário = TODOS os canais. A base diária só tem Meta+Google;
  // distribui linearmente por dia o gap pros demais canais (tools fixos + % receita), igual ao KPI.
  const breakdown = await computeTotalSpend(market as MainMarket, startDate, endDate, spend.meta, spend.google);
  const baseSum = Array.from(spend.total.values()).reduce((a, b) => a + b, 0);
  const gapPerDay = bqDaily.length > 0 ? Math.max(0, breakdown.total - baseSum) / bqDaily.length : 0;
  return bqDaily.map((r: any) => {
    const date = String(r.date);
    const totalSpend = (spend.total.get(date) || 0) + gapPerDay;
    const newCustomers = Number(r.new_customers) || 0;
    return {
      date,
      spend: totalSpend,
      newCustomers,
      cac: newCustomers > 0 ? totalSpend / newCustomers : 0,
    };
  });
}

/**
 * KPI summary agregado do período — soma dos daily values.
 */
export async function getKpiSummary(
  market: Market,
  startDate: string,
  endDate: string
): Promise<KpiSummary> {
  const [bqDaily, spend] = await Promise.all([
    queryDailyCac(market as MainMarket, startDate, endDate, 'day'),
    getSpendByDay(market, startDate, endDate),
  ]);

  // Cassia 2026-06-14: REGRA CANÔNICA — spend total inclui TODOS canais
  // (Meta + Google + Klaviyo + Attentive + Criteo + Agent.shop + Awin + ShopMy)
  const breakdown = await computeTotalSpend(market as MainMarket, startDate, endDate, spend.meta, spend.google);
  const totalSpend = breakdown.total;
  const orders = bqDaily.reduce((s: number, r: any) => s + (Number(r.orders) || 0), 0);
  const newCustomers = bqDaily.reduce((s: number, r: any) => s + (Number(r.new_customers) || 0), 0);
  // Revenue nao vem do queryDailyCac — calculamos do total spend pra agora
  // (se precisarmos, podemos adicionar uma query separada)
  const revenue = 0;

  const sources: DataSourceMeta = {
    metaAds: 'api',
    googleAds: 'api',
    shopify: 'api',
    monthly: 'bigquery',
  };

  return {
    market,
    spend: totalSpend,
    metaSpend: spend.meta,
    googleSpend: spend.google,
    newCustomers,
    cac: newCustomers > 0 ? totalSpend / newCustomers : 0,
    orders,
    revenue,
    cpo: orders > 0 ? totalSpend / orders : 0,
    startDate,
    endDate,
    sources,
  };
}

/**
 * Monthly series — últimos 12 meses, agregado mensalmente.
 */
export async function getMonthlySeries(market: Market): Promise<MonthlyPoint[]> {
  const today = new Date();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const startISO = startMonth.toISOString().slice(0, 10);
  const endISO = today.toISOString().slice(0, 10);

  // Usa granularity month do queryDailyCac, que retorna 12 buckets
  const [bqMonthly, spend] = await Promise.all([
    queryDailyCac(market as MainMarket, startISO, endISO, 'month'),
    getSpendByDay(market, startISO, endISO),
  ]);

  // Agregar spend daily (Meta+Google) -> monthly
  const monthlySpend = new Map<string, number>();
  spend.total.forEach((v, date) => {
    const m = date.slice(0, 7);
    monthlySpend.set(m, (monthlySpend.get(m) || 0) + v);
  });

  // Cassia 2026-06-26: adiciona os canais não-diários por mês (tools fixos + % receita) p/ o spend/CAC
  // mensal refletir TODOS os canais, igual ao KPI. tools = CHANNEL_COSTS (sem BQ); %rev = 1 query BQ/mês.
  const extras = await Promise.all(bqMonthly.map(async (r: any) => {
    const m = String(r.date).slice(0, 7);
    const d = new Date(m + '-01T00:00:00Z');
    const mStart = m + '-01';
    const mEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const tools = getFixedToolsCostInRange(market as MainMarket, mStart, mEnd);
    const pct = await getPercentRevenueCostsFromBQ(market as MainMarket, mStart, mEnd).then((x) => x.total).catch(() => 0);
    return [m, tools + pct] as const;
  }));
  const extraByMonth = new Map<string, number>(extras);

  return bqMonthly.map((r: any) => {
    const month = String(r.date).slice(0, 7); // queryDailyCac retorna primeiro dia do mes
    const spendMonth = (monthlySpend.get(month) || 0) + (extraByMonth.get(month) || 0);
    const newCustomers = Number(r.new_customers) || 0;
    return {
      month,
      spend: spendMonth,
      newCustomers,
      cac: newCustomers > 0 ? spendMonth / newCustomers : 0,
    };
  });
}

// ------- Helpers para getProductCac (BQ direto) -------

// MAX_ORDER_VALUE / EXCLUDED_TAGS_REGEX importados de @/lib/shared/dtc-filters (fonte unica)

function ordersDataset(market: Market): string {
  return market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
}

// Timezone por mercado (alinhado com Main Dashboard — REGRAS-LARROUDE-OS.md)
const TZ: Record<Market, string> = {
  US: 'America/New_York',
  BR: 'America/Sao_Paulo',
};

function shopifyFilters(market: Market, alias = 'o'): string {
  // Cassia 2026-07-02: financial_status canônico nos 2 mercados (refunded incluído — regra Enrico)
  const pixFilter = `AND ${alias}.financial_status NOT IN ('voided','pending','expired','authorized')`;
  return `
    AND ${alias}.cancelled_at IS NULL
    AND ${alias}.test = FALSE
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(${alias}.tags, '')), r'${EXCLUDED_TAGS_REGEX}')
    AND (JSON_VALUE(${alias}.customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(${alias}.customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}'))
    AND CAST(${alias}.total_price AS NUMERIC) < ${MAX_ORDER_VALUE[market]}
    ${pixFilter}
    ${excludeExchangesSQL(alias)}
  `;
}

/**
 * Mother SKU pattern (replicado do source CAC original):
 *   - Split SKU em '-'
 *   - parts[0] deve começar com L\d+
 *   - Se parts[2] for tamanho (numero tipo 5.0, 7.5), mother = parts[0]-parts[1]-parts[3] (cor)
 *   - Senao mother = parts[0]-parts[1]-parts[2]
 */
const MOTHER_SKU_SQL = `
  CASE
    WHEN ARRAY_LENGTH(SPLIT(li_sku, '-')) >= 4
         AND REGEXP_CONTAINS(SPLIT(li_sku, '-')[SAFE_OFFSET(0)], r'^L\\d+')
         AND REGEXP_CONTAINS(SPLIT(li_sku, '-')[SAFE_OFFSET(2)], r'^\\d+(\\.\\d+)?$')
    THEN CONCAT(
      SPLIT(li_sku, '-')[SAFE_OFFSET(0)], '-',
      SPLIT(li_sku, '-')[SAFE_OFFSET(1)], '-',
      SPLIT(li_sku, '-')[SAFE_OFFSET(3)]
    )
    WHEN ARRAY_LENGTH(SPLIT(li_sku, '-')) >= 3
         AND REGEXP_CONTAINS(SPLIT(li_sku, '-')[SAFE_OFFSET(0)], r'^L\\d+')
    THEN CONCAT(
      SPLIT(li_sku, '-')[SAFE_OFFSET(0)], '-',
      SPLIT(li_sku, '-')[SAFE_OFFSET(1)], '-',
      SPLIT(li_sku, '-')[SAFE_OFFSET(2)]
    )
    ELSE NULL
  END
`;

/**
 * Product CAC — agregação por mother SKU + alocação pro-rata de spend.
 *
 * Lógica (mesma do source CAC original):
 *   1. UNNEST line_items dos orders no período
 *   2. Identifica mother SKU
 *   3. Para cada (date, motherSku): units, revenue, newCustomers
 *   4. Aloca spend pro-rata = spend[day] * (productRevenue[day,sku] / totalRevenue[day])
 *   5. CAC[sku] = SUM(allocatedSpend) / SUM(newCustomers)
 */
export async function getProductCac(
  market: Market,
  startDate: string,
  endDate: string,
  limit = 200
): Promise<ProductCacResult> {
  const dataset = ordersDataset(market);

  const spendPromise = getSpendByDay(market, startDate, endDate);

  const sql = `
    WITH
    first_purchase AS (
      SELECT
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        MIN(DATE(o.created_at, '${TZ[market]}')) AS first_date
      FROM \`larroude-data-prod.${dataset}.orders\` o
      WHERE JSON_VALUE(o.customer, '$.id') IS NOT NULL
        ${shopifyFilters(market)}
      GROUP BY customer_id
    ),
    line_items_expanded AS (
      SELECT
        DATE(o.created_at, '${TZ[market]}') AS date,
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        o.id AS order_id,
        JSON_VALUE(li, '$.sku') AS li_sku,
        JSON_VALUE(li, '$.title') AS li_title,
        CAST(JSON_VALUE(li, '$.quantity') AS INT64) AS quantity,
        CAST(JSON_VALUE(li, '$.price') AS NUMERIC) * CAST(JSON_VALUE(li, '$.quantity') AS INT64) AS revenue
      FROM \`larroude-data-prod.${dataset}.orders\` o,
        UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
      WHERE DATE(o.created_at, '${TZ[market]}') BETWEEN @start AND @end
        ${shopifyFilters(market)}
    ),
    with_mother AS (
      SELECT
        date,
        customer_id,
        order_id,
        ${MOTHER_SKU_SQL} AS mother_sku,
        li_title,
        quantity,
        revenue
      FROM line_items_expanded
    ),
    product_daily AS (
      SELECT
        FORMAT_DATE('%Y-%m-%d', wm.date) AS date,
        wm.mother_sku,
        ANY_VALUE(wm.li_title) AS product_name,
        SUM(wm.quantity) AS units,
        SUM(wm.revenue) AS revenue,
        COUNT(DISTINCT IF(fp.first_date = wm.date, wm.customer_id, NULL)) AS new_customers
      FROM with_mother wm
      LEFT JOIN first_purchase fp ON wm.customer_id = fp.customer_id
      WHERE wm.mother_sku IS NOT NULL
      GROUP BY wm.date, wm.mother_sku
    )
    SELECT
      date,
      mother_sku,
      product_name,
      units,
      revenue,
      new_customers
    FROM product_daily
    ORDER BY date, mother_sku
  `;

  const [rows, spend] = await Promise.all([
    runQuery<{
      date: string;
      mother_sku: string;
      product_name: string;
      units: number;
      revenue: number | string;
      new_customers: number;
    }>(sql, { start: startDate, end: endDate }),
    spendPromise,
  ]);

  if (!rows.length) {
    return { products: [], productDaily: [] };
  }

  // Total revenue por dia (denominador da alocação)
  const dailyTotalRev = new Map<string, number>();
  for (const r of rows) {
    const v = Number(r.revenue) || 0;
    dailyTotalRev.set(r.date, (dailyTotalRev.get(r.date) || 0) + v);
  }

  // productDaily com allocatedSpend
  const productDaily: ProductDailyPoint[] = [];
  // Acumulador por mother SKU
  interface Acc {
    motherSku: string;
    productName: string;
    units: number;
    revenue: number;
    newCustomers: number;
    allocatedSpend: number;
  }
  const acc = new Map<string, Acc>();

  for (const r of rows) {
    const revenue = Number(r.revenue) || 0;
    const totalRevDay = dailyTotalRev.get(r.date) || 0;
    const daySpend = spend.total.get(r.date) || 0;
    const share = totalRevDay > 0 ? revenue / totalRevDay : 0;
    const allocated = daySpend * share;

    const pdNewCust = Number(r.new_customers) || 0;
    productDaily.push({
      date: r.date,
      motherSku: r.mother_sku,
      productName: r.product_name || r.mother_sku,
      units: Number(r.units) || 0,
      revenue,
      newCustomers: pdNewCust,
      allocatedSpend: allocated,
      cac: pdNewCust > 0 ? allocated / pdNewCust : 0,
    });

    let a = acc.get(r.mother_sku);
    if (!a) {
      a = {
        motherSku: r.mother_sku,
        productName: r.product_name || r.mother_sku,
        units: 0,
        revenue: 0,
        newCustomers: 0,
        allocatedSpend: 0,
      };
      acc.set(r.mother_sku, a);
    }
    a.units += Number(r.units) || 0;
    a.revenue += revenue;
    a.newCustomers += Number(r.new_customers) || 0;
    a.allocatedSpend += allocated;
  }

  const products = Array.from(acc.values())
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

  return { products, productDaily };
}

export async function getDataFreshness(market: 'US' | 'BR' = 'US'): Promise<string> {
  // Cassia 2026-06-12: D-1 no fuso do market (NY p/ US, Brasilia p/ BR).
  const { yesterdayInMarket } = await import('@/lib/utils/market-tz');
  return yesterdayInMarket(market);
}

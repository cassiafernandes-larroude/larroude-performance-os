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

import { queryDailyCac } from '@/lib/main-dashboard/queries';
import {
  queryGoogleAdsViaSupermetrics,
  queryMetaAdsViaSupermetrics,
} from '@/lib/main-dashboard/supermetrics';
import { queryMetaAdsDaily } from '@/lib/main-dashboard/meta-ads';
import type { Market as MainMarket } from '@/lib/main-dashboard/types';
import { getMetaSpendAdjustmentByDay } from '@/lib/shared/meta-adjustments';
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
  const [googleRows, apiMeta, smMetaRows] = await Promise.all([
    // Google: SEMPRE Supermetrics
    queryGoogleAdsViaSupermetrics(market as MainMarket, startDate, endDate).catch((err) => {
      console.error('[cac-bq] Supermetrics Google failed:', err);
      return [];
    }),
    // Meta: API direta PRIMARY — reusa queryMetaAdsDaily do Main Dashboard
    // (TODAS as 5 contas oficiais: US x2, BR x3 com FX USD->BRL)
    queryMetaAdsDaily(market as MainMarket, startDate, endDate)
      .then((rows) => {
        const map = new Map<string, number>();
        for (const r of rows) {
          const v = Number((r as any).spend) || 0;
          map.set((r as any).date, (map.get((r as any).date) || 0) + v);
        }
        return map;
      })
      .catch((err) => {
        console.error('[cac-bq] Meta Graph API direct failed:', err);
        return new Map<string, number>();
      }),
    // Meta Supermetrics: SOMENTE pra preencher gaps onde API nao retornou
    queryMetaAdsViaSupermetrics(market as MainMarket, startDate, endDate).catch((err) => {
      console.error('[cac-bq] Supermetrics Meta fallback failed:', err);
      return [];
    }),
  ]);

  // Google — apenas Supermetrics
  const googleByDay = new Map<string, number>();
  let googleTotal = 0;
  for (const r of googleRows) {
    const v = Number(r.spend) || 0;
    googleByDay.set(r.date, (googleByDay.get(r.date) || 0) + v);
    googleTotal += v;
  }

  // Meta — API direta PRIMARY, Supermetrics como fallback dia-a-dia
  const metaByDay = new Map<string, number>(apiMeta); // start from API
  for (const r of smMetaRows) {
    // SOMENTE preenche se API nao tiver aquela data
    if (!metaByDay.has(r.date)) {
      const v = Number(r.spend) || 0;
      metaByDay.set(r.date, v);
    }
  }
  // AJUSTE MANUAL: Meta US +$400k em Setembro/2025 (regra Cassia)
  // Distribui pro-rata dia-a-dia e soma ao Meta spend
  const adjByDay = getMetaSpendAdjustmentByDay(market as 'US' | 'BR', startDate, endDate);
  adjByDay.forEach((adjValue, date) => {
    metaByDay.set(date, (metaByDay.get(date) || 0) + adjValue);
  });
  let metaTotal = 0;
  metaByDay.forEach((v) => {
    metaTotal += v;
  });

  // Soma total por dia
  const total = new Map<string, number>();
  googleByDay.forEach((v, d) => total.set(d, (total.get(d) || 0) + v));
  metaByDay.forEach((v, d) => total.set(d, (total.get(d) || 0) + v));

  return { total, google: googleTotal, meta: metaTotal };
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
  // Substitui o spend (BQ all_channels_daily) pelo merged Meta API + Supermetrics
  return bqDaily.map((r: any) => {
    const date = String(r.date);
    const totalSpend = spend.total.get(date) || 0;
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

  const totalSpend = spend.google + spend.meta;
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

  // Agregar spend daily -> monthly
  const monthlySpend = new Map<string, number>();
  spend.total.forEach((v, date) => {
    const m = date.slice(0, 7);
    monthlySpend.set(m, (monthlySpend.get(m) || 0) + v);
  });

  return bqMonthly.map((r: any) => {
    const month = String(r.date).slice(0, 7); // queryDailyCac retorna primeiro dia do mes
    const spendMonth = monthlySpend.get(month) || 0;
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

const MAX_ORDER_VALUE: Record<Market, number> = { US: 30000, BR: 25000 };
const EXCLUDED_TAGS_REGEX = 'b2b|wholesale|marketplace|redo';

function ordersDataset(market: Market): string {
  return market === 'US' ? 'stg_shopify' : 'stg_shopify_br';
}

function shopifyFilters(market: Market, alias = 'o'): string {
  return `
    AND ${alias}.cancelled_at IS NULL
    AND ${alias}.test = FALSE
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(${alias}.tags, '')), r'${EXCLUDED_TAGS_REGEX}')
    AND (JSON_VALUE(${alias}.customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(${alias}.customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}'))
    AND CAST(${alias}.total_price AS NUMERIC) < ${MAX_ORDER_VALUE[market]}
    AND ${alias}.financial_status NOT IN ('voided', 'refunded')
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
        MIN(DATE(o.created_at)) AS first_date
      FROM \`larroude-data-prod.${dataset}.orders\` o
      WHERE JSON_VALUE(o.customer, '$.id') IS NOT NULL
        ${shopifyFilters(market)}
      GROUP BY customer_id
    ),
    line_items_expanded AS (
      SELECT
        DATE(o.created_at) AS date,
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        o.id AS order_id,
        JSON_VALUE(li, '$.sku') AS li_sku,
        JSON_VALUE(li, '$.title') AS li_title,
        CAST(JSON_VALUE(li, '$.quantity') AS INT64) AS quantity,
        CAST(JSON_VALUE(li, '$.price') AS NUMERIC) * CAST(JSON_VALUE(li, '$.quantity') AS INT64) AS revenue
      FROM \`larroude-data-prod.${dataset}.orders\` o,
        UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
      WHERE DATE(o.created_at) BETWEEN @start AND @end
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

    productDaily.push({
      date: r.date,
      motherSku: r.mother_sku,
      productTitle: r.product_name || r.mother_sku,
      units: Number(r.units) || 0,
      revenue,
      newCustomers: Number(r.new_customers) || 0,
      allocatedSpend: allocated,
    } as any);

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

export async function getDataFreshness(): Promise<string> {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

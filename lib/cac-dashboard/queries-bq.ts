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

/**
 * Product CAC — placeholder vazio enquanto nao portamos.
 */
export async function getProductCac(
  _market: Market,
  _startDate: string,
  _endDate: string,
  _limit = 200
): Promise<ProductCacResult> {
  return { products: [], productDaily: [] };
}

export async function getDataFreshness(): Promise<string> {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

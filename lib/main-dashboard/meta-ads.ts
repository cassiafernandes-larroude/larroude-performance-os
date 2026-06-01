// Cliente Meta Marketing API (Graph API) — busca DIRETO da Meta, sem Supermetrics
//
// Auth: System User access token com permissão ads_read em todas as contas.
// Env var: META_ACCESS_TOKEN ou FACEBOOK_ACCESS_TOKEN ou FB_ADS_ACCESS_TOKEN
//
// Endpoint: GET https://graph.facebook.com/v20.0/act_{ACCOUNT_ID}/insights
//
// Contas:
//  US: Larroudé US (2047856822417350) + PRE-ORDER US (929449929417505)
//  BR: Larroudé Brasil (1735567560524487) + Pre-Order BR (1975682443187483) + Brand BR (756931007040325)
//
// CURRENCY: TODAS as contas (US e BR) são cobradas em USD.
//   - US: mantém USD nativo
//   - BR: converte USD → BRL via FX rate ~5.45

import type { Market } from './types';
import { runQuery } from './bigquery';

const META_GRAPH_API = 'https://graph.facebook.com/v20.0';

const META_ACCOUNT_IDS: Record<Market, string[]> = {
  US: ['2047856822417350', '929449929417505'],
  BR: ['1735567560524487', '1975682443187483', '756931007040325'],
};

// FX cache por mês YYYY-MM
const fxRateCache = new Map<string, number>();
const FX_USD_BRL_FALLBACK = 5.0;

/**
 * Busca a taxa USD→BRL média do mês via BQ (gold.fx_rates_monthly).
 * Cache por mês.
 */
async function getFxRate(yyyymm: string): Promise<number> {
  if (fxRateCache.has(yyyymm)) return fxRateCache.get(yyyymm)!;
  try {
    const rows = await runQuery<any>(
      `SELECT avg_rate_brl_usd FROM \`larroude-data-prod.gold.fx_rates_monthly\` WHERE month = @m LIMIT 1`,
      { m: yyyymm },
    );
    const rate = Number(rows?.[0]?.avg_rate_brl_usd);
    if (rate > 0 && rate < 20) {
      fxRateCache.set(yyyymm, rate);
      return rate;
    }
  } catch (err: any) {
    console.warn(`[meta-ads] FX rate fetch falhou para ${yyyymm}:`, err?.message);
  }
  return FX_USD_BRL_FALLBACK;
}

function getToken(): string | null {
  return (
    process.env.META_ACCESS_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN ||
    process.env.FB_ADS_ACCESS_TOKEN ||
    process.env.META_GRAPH_ACCESS_TOKEN ||
    null
  );
}

export interface MetaDailyRow {
  date: string;
  account_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
  reach: number;
}

// Extrai value de actions array (Facebook insights format)
function extractAction(actions: any[] | undefined, type: string): number {
  if (!Array.isArray(actions)) return 0;
  const item = actions.find((a) => a?.action_type === type);
  return item ? Number(item.value || 0) : 0;
}

// Cache de currency por account (durante o lifetime do serverless)
const accountCurrencyCache = new Map<string, string>();

async function fetchAccountCurrency(accountId: string): Promise<string> {
  if (accountCurrencyCache.has(accountId)) return accountCurrencyCache.get(accountId)!;
  const token = getToken();
  if (!token) return 'USD';
  try {
    const url = `${META_GRAPH_API}/act_${accountId}?fields=currency&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return 'USD';
    const json = await res.json() as { currency?: string };
    const currency = (json.currency || 'USD').toUpperCase();
    accountCurrencyCache.set(accountId, currency);
    return currency;
  } catch {
    return 'USD';
  }
}

async function fetchAccountInsightsDaily(accountId: string, start: string, end: string): Promise<MetaDailyRow[]> {
  const token = getToken();
  if (!token) return [];
  const params = new URLSearchParams({
    fields: 'spend,impressions,clicks,actions,action_values,reach,date_start,account_currency',
    time_range: JSON.stringify({ since: start, until: end }),
    time_increment: '1',
    level: 'account',
    limit: '500',
    access_token: token,
  });
  const url = `${META_GRAPH_API}/act_${accountId}/insights?${params.toString()}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[meta-ads] HTTP ${res.status} act_${accountId}: ${body.slice(0, 300)}`);
      return [];
    }
    const json = JSON.parse(body) as { data?: any[]; error?: any };
    if (json.error) {
      console.warn(`[meta-ads] API error act_${accountId}:`, json.error?.message);
      return [];
    }
    if (!Array.isArray(json.data)) return [];
    // Captura currency da resposta (cada row tem account_currency)
    if (json.data[0]?.account_currency) {
      accountCurrencyCache.set(accountId, String(json.data[0].account_currency).toUpperCase());
    }
    return json.data.map((r: any) => ({
      date: String(r.date_start || '').slice(0, 10),
      account_id: accountId,
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
      purchases: extractAction(r.actions, 'offsite_conversion.fb_pixel_purchase'),
      purchase_value: extractAction(r.action_values, 'offsite_conversion.fb_pixel_purchase'),
      reach: Number(r.reach || 0),
    }));
  } catch (err: any) {
    console.warn(`[meta-ads] fetch falhou act_${accountId}:`, err?.message);
    return [];
  }
}

/**
 * Busca insights diários de TODAS as contas Meta do market.
 * Aplica FX dinâmico por conta E por mês (USD→BRL real do BQ).
 */
export async function queryMetaAdsDaily(market: Market, start: string, end: string): Promise<MetaDailyRow[]> {
  const accountIds = META_ACCOUNT_IDS[market];
  const results = await Promise.all(accountIds.map((id) => fetchAccountInsightsDaily(id, start, end)));
  const targetCurrency = market === 'BR' ? 'BRL' : 'USD';
  const merged: MetaDailyRow[] = [];
  for (let i = 0; i < accountIds.length; i++) {
    const accountId = accountIds[i];
    const accountCurrency = accountCurrencyCache.get(accountId) || 'USD';
    for (const r of results[i]) {
      const needsFx = accountCurrency === 'USD' && targetCurrency === 'BRL';
      const fx = needsFx ? await getFxRate(r.date.slice(0, 7)) : 1;
      merged.push({
        ...r,
        spend: r.spend * fx,
        purchase_value: r.purchase_value * fx,
      });
    }
  }
  // Agrega por data (soma todas as contas no mesmo dia)
  const byDate = new Map<string, MetaDailyRow>();
  for (const r of merged) {
    if (!r.date) continue;
    const existing = byDate.get(r.date);
    if (existing) {
      existing.spend += r.spend;
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
      existing.purchases += r.purchases;
      existing.purchase_value += r.purchase_value;
      existing.reach += r.reach;
    } else {
      byDate.set(r.date, { ...r, account_id: 'merged' });
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Soma agregada de Meta Ads no período (todas as contas, com FX se BR).
 */
export async function queryMetaAdsTotal(market: Market, start: string, end: string) {
  const daily = await queryMetaAdsDaily(market, start, end);
  return daily.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      purchases: acc.purchases + r.purchases,
      purchase_value: acc.purchase_value + r.purchase_value,
      reach: acc.reach + r.reach,
    }),
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0, reach: 0 }
  );
}

/**
 * Busca campanhas Meta para a tabela TOP 10 ROAS.
 * Retorna [{ campaign_name, spend, purchases, roas, last_spend_date, account_id }]
 */
export interface MetaCampaignRow {
  campaign_name: string;
  account_id: string;
  spend: number;
  purchases: number;
  purchase_value: number;
  roas: number | null;
  last_spend_date: string | null;
}

async function fetchAccountCampaigns(accountId: string, start: string, end: string): Promise<MetaCampaignRow[]> {
  const token = getToken();
  if (!token) return [];
  const params = new URLSearchParams({
    fields: 'campaign_name,spend,actions,action_values,date_start',
    time_range: JSON.stringify({ since: start, until: end }),
    time_increment: '1',
    level: 'campaign',
    limit: '500',
    access_token: token,
  });
  const url = `${META_GRAPH_API}/act_${accountId}/insights?${params.toString()}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[meta-ads campaigns] HTTP ${res.status} act_${accountId}: ${body.slice(0, 200)}`);
      return [];
    }
    const json = JSON.parse(body) as { data?: any[] };
    if (!Array.isArray(json.data)) return [];
    // Agrega por campaign_name
    const byCampaign = new Map<string, MetaCampaignRow>();
    for (const r of json.data) {
      const name = String(r.campaign_name || '(sem nome)');
      const date = String(r.date_start || '').slice(0, 10);
      const spend = Number(r.spend || 0);
      const purchases = extractAction(r.actions, 'offsite_conversion.fb_pixel_purchase');
      const purchase_value = extractAction(r.action_values, 'offsite_conversion.fb_pixel_purchase');
      const existing = byCampaign.get(name) ?? {
        campaign_name: name, account_id: accountId, spend: 0, purchases: 0, purchase_value: 0,
        roas: null, last_spend_date: null,
      };
      existing.spend += spend;
      existing.purchases += purchases;
      existing.purchase_value += purchase_value;
      if (spend > 0 && (!existing.last_spend_date || date > existing.last_spend_date)) {
        existing.last_spend_date = date;
      }
      byCampaign.set(name, existing);
    }
    // Calcula ROAS
    for (const row of byCampaign.values()) {
      row.roas = row.spend > 0 ? row.purchase_value / row.spend : null;
    }
    return Array.from(byCampaign.values()).filter((c) => c.spend > 0);
  } catch (err: any) {
    console.warn(`[meta-ads campaigns] fetch falhou act_${accountId}:`, err?.message);
    return [];
  }
}

export async function queryMetaCampaigns(market: Market, start: string, end: string): Promise<MetaCampaignRow[]> {
  const accountIds = META_ACCOUNT_IDS[market];
  await Promise.all(accountIds.map((id) => fetchAccountCurrency(id)));
  const results = await Promise.all(accountIds.map((id) => fetchAccountCampaigns(id, start, end)));
  const targetCurrency = market === 'BR' ? 'BRL' : 'USD';
  // Para campanhas, usa o mês do start como referência (campanhas agregadas no período)
  const fxMonth = start.slice(0, 7);
  const fxRate = await getFxRate(fxMonth);
  const all: MetaCampaignRow[] = [];
  for (let i = 0; i < accountIds.length; i++) {
    const accountId = accountIds[i];
    const accountCurrency = accountCurrencyCache.get(accountId) || 'USD';
    const fx = (accountCurrency === 'USD' && targetCurrency === 'BRL') ? fxRate : 1;
    for (const c of results[i]) {
      all.push({
        ...c,
        spend: c.spend * fx,
        purchase_value: c.purchase_value * fx,
      });
    }
  }
  return all.sort((a, b) => b.spend - a.spend);
}

/**
 * Debug helper: retorna spend por conta com currency detectada.
 */
export async function queryMetaSpendByAccount(market: Market, start: string, end: string): Promise<Array<{
  account_id: string;
  account_currency: string;
  spend_native: number;
  spend_final_brl: number;
  fx_applied: number;
  rows: number;
}>> {
  const accountIds = META_ACCOUNT_IDS[market];
  const targetCurrency = market === 'BR' ? 'BRL' : 'USD';
  const fxRate = await getFxRate(start.slice(0, 7));
  const results = await Promise.all(accountIds.map(async (id) => {
    const daily = await fetchAccountInsightsDaily(id, start, end);
    const accountCurrency = accountCurrencyCache.get(id) || 'USD';
    const totalNative = daily.reduce((s, r) => s + r.spend, 0);
    const fx = (accountCurrency === 'USD' && targetCurrency === 'BRL') ? fxRate : 1;
    return {
      account_id: id,
      account_currency: accountCurrency,
      spend_native: totalNative,
      spend_final_brl: totalNative * fx,
      fx_applied: fx,
      rows: daily.length,
    };
  }));
  return results;
}

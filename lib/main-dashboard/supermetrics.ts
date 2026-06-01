// Cliente Supermetrics REST API para buscar Google Ads, Meta Ads e GA4 diretamente
// (BQ tem gaps Feb-Apr 2026 e só sincroniza 1 das 3 contas Meta BR — Supermetrics busca em tempo real)
//
// CURRENCY:
//   - Google Ads BR: já em BRL (conta configurada em BRL) — sem conversão
//   - Google Ads US: em USD — sem conversão
//   - Meta Ads US: em USD — sem conversão
//   - Meta Ads BR: TODAS as 3 contas estão em USD — converter USD→BRL via FX rate

import type { Market } from './types';

const SUPERMETRICS_API = 'https://api.supermetrics.com/enterprise/v2/query';

// Account IDs do Google Ads via Supermetrics
const GADS_ACCOUNT_IDS: Record<Market, string[]> = {
  US: ['7244161860'],  // Larroudé - Google US
  BR: ['4794620842'],  // Larroude BR - Google (BRL nativo)
};

// Account IDs do GA4 via Supermetrics (Properties)
const GA4_ACCOUNT_IDS: Record<Market, string> = {
  US: '254497689',  // Larroude.com - GA4
  BR: '459103738',  // Larroudé Brasil
};

// Account IDs do Meta Ads via Supermetrics (todas em USD)
//  US: Larroudé US + PRE-ORDER US
//  BR: Larroudé Brasil + Pre-Order BR + Brand BR (todas USD!)
// IMPORTANTE: Supermetrics aceita SEM o prefixo act_ (numéricos puros)
const META_ACCOUNT_IDS: Record<Market, string[]> = {
  US: ['2047856822417350', '929449929417505'],
  BR: ['1735567560524487', '1975682443187483', '756931007040325'],
};

// FX rate USD→BRL — fallback se BQ fx_rates_monthly indisponível.
// Atualizado mensalmente. Mai/2026 ~ 5.45 BRL/USD.
const FX_USD_BRL_FALLBACK = 5.45;

interface SupermetricsResponse {
  data?: any[][];
  meta?: any;
  error?: any;
}

interface DailyAdRow {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversion_value: number;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function fetchSupermetrics(params: Record<string, any>): Promise<SupermetricsResponse | null> {
  const apiKey = process.env.SUPERMETRICS_API_KEY;
  if (!apiKey) {
    console.warn('[supermetrics] SUPERMETRICS_API_KEY ausente');
    return null;
  }
  try {
    const url = `${SUPERMETRICS_API}?json=${encodeURIComponent(JSON.stringify(params))}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const bodyText = await res.text();
    if (!res.ok) {
      console.warn(`[supermetrics ds_id=${params.ds_id}] HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
      return null;
    }
    try {
      return JSON.parse(bodyText) as SupermetricsResponse;
    } catch {
      console.warn(`[supermetrics ds_id=${params.ds_id}] JSON parse falhou: ${bodyText.slice(0, 200)}`);
      return null;
    }
  } catch (err: any) {
    console.warn('[supermetrics] fetch falhou:', err?.message);
    return null;
  }
}

// --------------------------------------------------------------------------
// Google Ads
// --------------------------------------------------------------------------

export async function queryGoogleAdsViaSupermetrics(market: Market, start: string, end: string): Promise<DailyAdRow[]> {
  const accountIds = GADS_ACCOUNT_IDS[market];
  const params = {
    ds_id: 'AW',
    ds_accounts: accountIds,
    fields: 'Date,Cost,Clicks,Impressions,Conversions,ConversionValue',
    date_range_type: 'custom',
    start_date: start,
    end_date: end,
    max_rows: 1000,
  };
  const json = await fetchSupermetrics(params);
  if (!json?.data || json.data.length < 2) return [];
  // Agrega por data (se múltiplas contas, soma)
  const byDate = new Map<string, DailyAdRow>();
  for (const r of json.data.slice(1)) {
    const date = String(r[0]);
    const row: DailyAdRow = byDate.get(date) ?? {
      date, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0,
    };
    row.spend += Number(r[1] || 0);
    row.clicks += Number(r[2] || 0);
    row.impressions += Number(r[3] || 0);
    row.conversions += Number(r[4] || 0);
    row.conversion_value += Number(r[5] || 0);
    byDate.set(date, row);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Campanhas Google Ads (Top ROAS) via Supermetrics
export interface GoogleCampaignRow {
  campaign: string;
  spend: number;
  conversions: number;
  conversion_value: number;
  roas: number | null;
  last_spend_date: string | null;
}

export async function queryGoogleCampaignsViaSupermetrics(market: Market, start: string, end: string): Promise<GoogleCampaignRow[]> {
  const accountIds = GADS_ACCOUNT_IDS[market];
  const params = {
    ds_id: 'AW',
    ds_accounts: accountIds,
    fields: 'CampaignName,Date,Cost,Conversions,ConversionValue',
    date_range_type: 'custom',
    start_date: start,
    end_date: end,
    max_rows: 5000,
  };
  const json = await fetchSupermetrics(params);
  if (!json?.data || json.data.length < 2) return [];
  const byCampaign = new Map<string, GoogleCampaignRow>();
  for (const r of json.data.slice(1)) {
    const name = String(r[0] || '(sem nome)');
    const date = String(r[1] || '');
    const spend = Number(r[2] || 0);
    const conv = Number(r[3] || 0);
    const cval = Number(r[4] || 0);
    const row = byCampaign.get(name) ?? {
      campaign: name, spend: 0, conversions: 0, conversion_value: 0, roas: null,
      last_spend_date: null,
    };
    row.spend += spend;
    row.conversions += conv;
    row.conversion_value += cval;
    if (spend > 0 && (!row.last_spend_date || date > row.last_spend_date)) {
      row.last_spend_date = date;
    }
    byCampaign.set(name, row);
  }
  // Calcula ROAS final
  for (const row of byCampaign.values()) {
    row.roas = row.spend > 0 ? row.conversion_value / row.spend : null;
  }
  return Array.from(byCampaign.values()).filter((c) => c.spend > 0);
}

export async function queryGoogleAdsTotalViaSupermetrics(market: Market, start: string, end: string) {
  const daily = await queryGoogleAdsViaSupermetrics(market, start, end);
  return daily.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      clicks: acc.clicks + r.clicks,
      impressions: acc.impressions + r.impressions,
      conversions: acc.conversions + r.conversions,
      conversion_value: acc.conversion_value + r.conversion_value,
    }),
    { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 }
  );
}

// --------------------------------------------------------------------------
// Meta Ads — TODAS as contas via Supermetrics
//   US: 2 contas em USD
//   BR: 3 contas em USD → convertidas para BRL via FX rate
// --------------------------------------------------------------------------

export async function queryMetaAdsViaSupermetrics(market: Market, start: string, end: string): Promise<DailyAdRow[]> {
  const accountIds = META_ACCOUNT_IDS[market];
  // Meta via Supermetrics: ds_id = 'FA' (Facebook Ads / Meta)
  const params = {
    ds_id: 'FA',
    ds_accounts: accountIds,
    fields: 'Date,Spend,Impressions,Clicks,Purchases,PurchaseValue',
    date_range_type: 'custom',
    start_date: start,
    end_date: end,
    max_rows: 5000,
  };
  const json = await fetchSupermetrics(params);
  if (!json?.data || json.data.length < 2) return [];
  // FX rate só importa para BR (Meta BR é cobrado em USD)
  const fx = market === 'BR' ? FX_USD_BRL_FALLBACK : 1;
  const byDate = new Map<string, DailyAdRow>();
  for (const r of json.data.slice(1)) {
    const date = String(r[0]);
    const row: DailyAdRow = byDate.get(date) ?? {
      date, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0,
    };
    row.spend += Number(r[1] || 0) * fx;
    row.impressions += Number(r[2] || 0);
    row.clicks += Number(r[3] || 0);
    row.conversions += Number(r[4] || 0);
    row.conversion_value += Number(r[5] || 0) * fx;
    byDate.set(date, row);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function queryMetaAdsTotalViaSupermetrics(market: Market, start: string, end: string) {
  const daily = await queryMetaAdsViaSupermetrics(market, start, end);
  return daily.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      clicks: acc.clicks + r.clicks,
      impressions: acc.impressions + r.impressions,
      conversions: acc.conversions + r.conversions,
      conversion_value: acc.conversion_value + r.conversion_value,
    }),
    { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 }
  );
}

// --------------------------------------------------------------------------
// GA4 — sessions reais, CVR oficial
// --------------------------------------------------------------------------

interface GA4DailyRow {
  date: string;
  sessions: number;
  transactions: number;
  conversion_rate: number; // fração (0.0093 = 0.93%)
}

export async function queryGA4ViaSupermetrics(market: Market, start: string, end: string): Promise<GA4DailyRow[]> {
  const accountId = GA4_ACCOUNT_IDS[market];
  const params = {
    ds_id: 'GAWA',
    ds_accounts: [accountId],
    fields: 'date,sessions,transactions,sessionConversionRate',
    date_range_type: 'custom',
    start_date: start,
    end_date: end,
    max_rows: 500,
  };
  const json = await fetchSupermetrics(params);
  if (!json?.data || json.data.length < 2) return [];
  return json.data.slice(1).map((r: any[]) => ({
    date: String(r[0]),
    sessions: Number(r[1] || 0),
    transactions: Number(r[2] || 0),
    conversion_rate: Number(r[3] || 0) / 100, // Supermetrics retorna em %
  }));
}

export async function queryGA4TotalViaSupermetrics(market: Market, start: string, end: string) {
  const daily = await queryGA4ViaSupermetrics(market, start, end);
  const totals = daily.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      transactions: acc.transactions + r.transactions,
    }),
    { sessions: 0, transactions: 0 }
  );
  const conversion_rate = totals.sessions > 0 ? totals.transactions / totals.sessions : 0;
  return { ...totals, conversion_rate };
}

// --------------------------------------------------------------------------
// GA4 por canal (Default Channel Group) — Direct / Organic / Referral / Paid Social / Email
// --------------------------------------------------------------------------

interface GA4SessionByChannelDay {
  date: string;
  direct: number;
  organic: number;
  referral: number;
  paidSocial: number;
  email: number;
  other: number;
  total: number;
}

export async function queryGA4SessionsByChannel(market: Market, start: string, end: string): Promise<GA4SessionByChannelDay[]> {
  const accountId = GA4_ACCOUNT_IDS[market];
  const params = {
    ds_id: 'GAWA',
    ds_accounts: [accountId],
    fields: 'date,sessionDefaultChannelGroup,sessions',
    date_range_type: 'custom',
    start_date: start,
    end_date: end,
    max_rows: 5000,
  };
  const json = await fetchSupermetrics(params);
  if (!json?.data || json.data.length < 2) return [];
  const byDate = new Map<string, GA4SessionByChannelDay>();
  for (const r of json.data.slice(1)) {
    const date = String(r[0]);
    const channel = String(r[1] || '').toLowerCase();
    const sessions = Number(r[2] || 0);
    const row: GA4SessionByChannelDay = byDate.get(date) ?? {
      date, direct: 0, organic: 0, referral: 0, paidSocial: 0, email: 0, other: 0, total: 0,
    };
    if (channel.includes('direct')) row.direct += sessions;
    else if (channel.includes('organic search') || channel === 'organic') row.organic += sessions;
    else if (channel.includes('referral')) row.referral += sessions;
    else if (channel.includes('paid social') || channel.includes('paid_social')) row.paidSocial += sessions;
    else if (channel.includes('email')) row.email += sessions;
    else row.other += sessions;
    row.total += sessions;
    byDate.set(date, row);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

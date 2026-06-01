// Cliente Triple Whale API — sessões + CVR oficiais
// Docs: https://developers.triplewhale.com
//
// Triple Whale agrega sessões e conversions de múltiplas fontes (Shopify nativas,
// GA4, pixel próprio) — fonte mais confiável que GA4 isolado.
//
// Auth: API key no header `x-api-key` (Triple Whale Enterprise)
// Endpoint: GET /v2/summary-page?startDate=...&endDate=...&shop_domain=...

import type { Market } from './types';

const TW_API_BASE = 'https://api.triplewhale.com/api/v2';

// Domínios Shopify (vinculados às lojas Triple Whale)
const SHOP_DOMAIN: Record<Market, string> = {
  US: 'larroude.myshopify.com',
  BR: 'larroude-br.myshopify.com',
};

export interface TWDailyRow {
  date: string;       // YYYY-MM-DD
  sessions: number;   // sessões únicas (TW agregada)
  orders: number;     // pedidos
  cvr: number;        // fração (0.0093 = 0.93%)
}

export interface TWTotals {
  sessions: number;
  orders: number;
  cvr: number;        // fração
}

async function fetchTW(path: string, params: Record<string, string>): Promise<any | null> {
  const apiKey = process.env.TRIPLE_WHALE_API_KEY;
  if (!apiKey) {
    console.warn('[triple-whale] TRIPLE_WHALE_API_KEY ausente');
    return null;
  }
  const qs = new URLSearchParams(params).toString();
  const url = `${TW_API_BASE}${path}?${qs}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.warn('[triple-whale]', res.status, await res.text().catch(() => ''));
      return null;
    }
    return await res.json();
  } catch (err: any) {
    console.warn('[triple-whale] fetch falhou:', err?.message);
    return null;
  }
}

/**
 * Busca sessões e CVR diárias do Triple Whale.
 * Retorna array de { date, sessions, orders, cvr (fração) }.
 */
export async function queryTripleWhaleDaily(market: Market, start: string, end: string): Promise<TWDailyRow[]> {
  const shop = SHOP_DOMAIN[market];
  const data = await fetchTW('/summary-page/get-summary', {
    startDate: start,
    endDate: end,
    shop_domain: shop,
    timezone: market === 'US' ? 'America/New_York' : 'America/Sao_Paulo',
    granularity: 'daily',
  });
  if (!data) return [];

  // O payload pode variar: tentamos múltiplas estruturas conhecidas
  const rows = data?.data ?? data?.daily ?? data?.summary ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows.map((r: any) => {
    const date = String(r.date || r.day || r.x || '').slice(0, 10);
    const sessions = Number(r.sessions ?? r.session_count ?? r.visitors ?? 0);
    const orders = Number(r.orders ?? r.order_count ?? 0);
    const cvr = sessions > 0 ? orders / sessions : 0;
    return { date, sessions, orders, cvr };
  }).filter((r) => r.date);
}

/**
 * Soma agregada de sessões e CVR no período.
 */
export async function queryTripleWhaleTotals(market: Market, start: string, end: string): Promise<TWTotals> {
  const daily = await queryTripleWhaleDaily(market, start, end);
  const totals = daily.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      orders: acc.orders + r.orders,
    }),
    { sessions: 0, orders: 0 }
  );
  return {
    ...totals,
    cvr: totals.sessions > 0 ? totals.orders / totals.sessions : 0,
  };
}

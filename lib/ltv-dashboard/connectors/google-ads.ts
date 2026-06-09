/**
 * Google Ads API connector — pulls spend directly from Google Ads Reporting.
 * Used ONLY by the LTV/CAC ratio KPI in this dashboard.
 *
 * Endpoint: POST /v18/customers/{customer_id}/googleAds:searchStream
 * Auth: OAuth2 — exchanges refresh_token for access_token, then bearer auth.
 *
 * Currency: each Google Ads customer has a fixed currency_code. We fetch it
 * with the cost query and convert to the target market currency if needed
 * (USD→BRL or BRL→USD) using META_USD_TO_BRL.
 *
 * If GADS_REFRESH_TOKEN is not set, falls back to BigQuery
 * (`gold_marketing.fct_ads_spend_daily`) where the spend is already
 * normalized to the market currency.
 */

import { runQuery } from '../bigquery';
import type { Market } from '../queries';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_BASE = 'https://googleads.googleapis.com/v18';

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getUsdToBrl(): number {
  const raw = process.env.META_USD_TO_BRL;
  const parsed = raw ? parseFloat(raw) : 5.1;
  if (!isFinite(parsed) || parsed <= 0) return 5.1;
  return parsed;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const clientId = process.env.GADS_CLIENT_ID;
  const clientSecret = process.env.GADS_CLIENT_SECRET;
  const refreshToken = process.env.GADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GADS_OAUTH_INCOMPLETE');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(TOKEN_URL, { method: 'POST', body, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Google OAuth refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

async function fetchSpendDirect(
  market: Market,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const customerId =
    market === 'US'
      ? process.env.GADS_CUSTOMER_ID_US ?? process.env.GADS_CUSTOMER_ID
      : process.env.GADS_CUSTOMER_ID_BR ?? process.env.GADS_CUSTOMER_ID;
  if (!customerId) throw new Error(`GADS_CUSTOMER_ID_${market} not set`);

  const developerToken = process.env.GADS_DEVELOPER_TOKEN;
  const loginCustomerId = process.env.GADS_LOGIN_CUSTOMER_ID;
  if (!developerToken) throw new Error('GADS_DEVELOPER_TOKEN not set');

  const accessToken = await getAccessToken();

  const query = `
    SELECT segments.date, metrics.cost_micros, customer.currency_code
    FROM customer
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `.trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');

  const res = await fetch(`${ADS_BASE}/customers/${customerId.replace(/-/g, '')}/googleAds:searchStream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Google Ads API ${customerId}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  const chunks = (await res.json()) as Array<{
    results?: Array<{
      segments: { date: string };
      metrics: { costMicros: string };
      customer?: { currencyCode?: string };
    }>;
  }>;

  const out = new Map<string, number>();
  const targetCurrency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';
  const rate = getUsdToBrl();

  for (const chunk of chunks) {
    for (const row of chunk.results ?? []) {
      const native = Number(row.metrics.costMicros) / 1_000_000;
      const accountCurrency = (row.customer?.currencyCode ?? targetCurrency).toUpperCase() as
        | 'USD'
        | 'BRL';

      let valueOut = native;
      if (accountCurrency !== targetCurrency) {
        if (accountCurrency === 'USD' && targetCurrency === 'BRL') valueOut = native * rate;
        else if (accountCurrency === 'BRL' && targetCurrency === 'USD') valueOut = native / rate;
      }

      out.set(row.segments.date, (out.get(row.segments.date) ?? 0) + valueOut);
    }
  }
  return out;
}

async function fetchSpendBigQueryFallback(
  market: Market,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const rows = await runQuery<{ date: string; spend: number }>(
    `
    SELECT FORMAT_DATE('%Y-%m-%d', date) AS date, SUM(spend) AS spend
    FROM \`larroude-data-platform.gold_marketing.fct_ads_spend_daily\`
    WHERE date BETWEEN @start AND @end
      AND LOWER(market) = @market
      AND channel = 'google_ads'
    GROUP BY date
    `,
    { start: startDate, end: endDate, market: market.toLowerCase() }
  );

  const out = new Map<string, number>();
  for (const r of rows) out.set(r.date, Number(r.spend ?? 0));
  return out;
}

/**
 * Returns Google Ads spend by day in the market's currency.
 * Tries direct API first; falls back to BigQuery if OAuth is incomplete.
 */
export async function getGoogleAdsSpendByDay(
  market: Market,
  startDate: string,
  endDate: string
): Promise<{ data: Map<string, number>; source: 'api' | 'bigquery_fallback' }> {
  try {
    const data = await fetchSpendDirect(market, startDate, endDate);
    return { data, source: 'api' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('GADS_OAUTH_INCOMPLETE') || msg.includes('not set')) {
      console.warn(`[google-ads] direct API unavailable, falling back to BigQuery: ${msg}`);
      const data = await fetchSpendBigQueryFallback(market, startDate, endDate);
      return { data, source: 'bigquery_fallback' };
    }
    throw err;
  }
}

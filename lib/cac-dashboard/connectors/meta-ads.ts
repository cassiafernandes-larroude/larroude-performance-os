/**
 * Meta Marketing API connector — pulls spend directly from Meta Insights.
 *
 * Endpoint: GET /v22.0/{ad_account_id}/insights
 * Auth: long-lived user access token (META_ACCESS_TOKEN, ~60d expiry)
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 *
 * CURRENCY HANDLING (validated 2026-05-07):
 *   - All US accounts report in USD → no conversion.
 *   - BR accounts:
 *     - act_1735567560524487 (Larroude Brasil) → reports in USD!
 *       Converted to BRL using META_USD_TO_BRL (default 5.10).
 *     - act_756931007040325 (Larroude BR Brand) → reports in BRL.
 *     - act_1975682443187483 (Larroude BR Pre-Order) → reports in BRL.
 *
 *   The conversion rate is configurable via META_USD_TO_BRL env var
 *   so it can be updated without a code change.
 */

import type { Market } from '../queries';

export interface MetaAccount {
  id: string;
  name: string;
  preOrder: boolean;
  /** Currency the account natively reports in (Insights API). */
  currency: 'USD' | 'BRL';
}

export const META_ACCOUNTS: Record<Market, MetaAccount[]> = {
  US: [
    { id: 'act_2047856822417350', name: 'Larroude US', preOrder: false, currency: 'USD' },
    { id: 'act_312869193575906', name: 'Larroude New', preOrder: false, currency: 'USD' },
    { id: 'act_929449929417505', name: 'PRE-ORDER US', preOrder: true, currency: 'USD' },
  ],
  BR: [
    // ⚠️ Larroude Brasil reports in USD — converted to BRL via META_USD_TO_BRL.
    { id: 'act_1735567560524487', name: 'Larroude Brasil', preOrder: false, currency: 'USD' },
    { id: 'act_756931007040325', name: 'Larroude BR - Brand', preOrder: false, currency: 'BRL' },
    { id: 'act_1975682443187483', name: 'Larroude BR - Pre-Order', preOrder: true, currency: 'BRL' },
  ],
};

const API_VERSION = 'v22.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

interface MetaInsightsRow {
  date_start: string;
  date_stop: string;
  spend: string;
  account_currency?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
  paging?: { next?: string };
  error?: { message: string; type: string; code: number };
}

function getToken(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error('META_ACCESS_TOKEN not set');
  return t;
}

function getUsdToBrl(): number {
  const raw = process.env.META_USD_TO_BRL;
  const parsed = raw ? parseFloat(raw) : 5.1;
  if (!isFinite(parsed) || parsed <= 0) return 5.1;
  return parsed;
}

/**
 * Fetch spend by day for one account, converting to the target market currency.
 * Returns Map<YYYY-MM-DD, spend in TARGET currency>.
 */
async function fetchAccountInsights(
  account: MetaAccount,
  targetMarket: Market,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const params = new URLSearchParams({
    fields: 'spend,date_start,account_currency',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: '1',
    level: 'account',
    access_token: getToken(),
    limit: '500',
  });

  const url = `${BASE}/${account.id}/insights?${params.toString()}`;
  const out = new Map<string, number>();
  const targetCurrency: 'USD' | 'BRL' = targetMarket === 'US' ? 'USD' : 'BRL';

  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { cache: 'no-store' });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Meta API ${account.id}: ${res.status} ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as MetaInsightsResponse;
    if (json.error) throw new Error(`Meta API ${account.id}: ${json.error.message}`);

    for (const row of json.data) {
      const native = parseFloat(row.spend);
      if (!isFinite(native)) continue;

      // Use the account_currency from the API response when available, fall back to our static mapping
      const accountCurrency = (row.account_currency as 'USD' | 'BRL') || account.currency;

      let valueOut = native;
      if (accountCurrency !== targetCurrency) {
        if (accountCurrency === 'USD' && targetCurrency === 'BRL') {
          valueOut = native * getUsdToBrl();
        } else if (accountCurrency === 'BRL' && targetCurrency === 'USD') {
          valueOut = native / getUsdToBrl();
        }
      }

      out.set(row.date_start, (out.get(row.date_start) ?? 0) + valueOut);
    }

    next = json.paging?.next ?? null;
  }

  return out;
}

/**
 * Returns spend by day, summed across the market's ad accounts (in market currency).
 *   US → USD
 *   BR → BRL (Larroude Brasil's USD spend is converted using META_USD_TO_BRL)
 */
export async function getMetaSpendByDay(
  market: Market,
  startDate: string,
  endDate: string,
  options: { includePreOrder?: boolean } = {}
): Promise<Map<string, number>> {
  const includePO = options.includePreOrder ?? true;
  const accounts = META_ACCOUNTS[market].filter((a) => includePO || !a.preOrder);

  const perAccount = await Promise.all(
    accounts.map((a) => fetchAccountInsights(a, market, startDate, endDate))
  );

  const total = new Map<string, number>();
  for (const m of perAccount) {
    for (const [date, spend] of m) {
      total.set(date, (total.get(date) ?? 0) + spend);
    }
  }
  return total;
}

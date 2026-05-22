// Cliente Meta Marketing API (Graph API) - busca direto do Meta
// Replica logica do dashboard-geral: detecta currency real por conta e converte USD->BRL so quando necessario
import type { Market } from "@/types/metric";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";

const META_GRAPH_API = "https://graph.facebook.com/v20.0";

const META_ACCOUNT_IDS: Record<Market, string[]> = {
  US: ["2047856822417350", "929449929417505"],
  BR: ["1735567560524487", "1975682443187483", "756931007040325"],
};

const FX_FALLBACK = 5.45;
const fxCache = new Map<string, number>();
const currencyCache = new Map<string, string>();

async function getFxRate(yyyymm: string): Promise<number> {
  if (fxCache.has(yyyymm)) return fxCache.get(yyyymm)!;
  if (!hasBigQueryCredentials()) return FX_FALLBACK;
  try {
    const rows = await runQuery<{ avg_rate_brl_usd?: number | string }>(
      `SELECT avg_rate_brl_usd FROM \`larroude-data-prod.gold.fx_rates_monthly\` WHERE month = @m LIMIT 1`,
      { m: yyyymm }
    );
    const rate = Number(rows?.[0]?.avg_rate_brl_usd);
    if (rate > 0 && rate < 20) {
      fxCache.set(yyyymm, rate);
      return rate;
    }
  } catch {}
  return FX_FALLBACK;
}

function token(): string | null {
  return (
    process.env.META_ACCESS_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN ||
    null
  );
}

async function fetchInsights(accountId: string, start: string, end: string): Promise<Array<{ date: string; spend: number; currency: string }>> {
  const t = token();
  if (!t) return [];
  const params = new URLSearchParams({
    fields: "spend,date_start,account_currency",
    time_range: JSON.stringify({ since: start, until: end }),
    time_increment: "1",
    level: "account",
    limit: "500",
    access_token: t,
  });
  const url = `${META_GRAPH_API}/act_${accountId}/insights?${params}`;
  try {
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[meta-api] HTTP ${res.status} act_${accountId}: ${body.slice(0, 200)}`);
      return [];
    }
    const json = JSON.parse(body) as { data?: Array<{ date_start?: string; spend?: string; account_currency?: string }> };
    if (!Array.isArray(json.data)) return [];
    const currency = (json.data[0]?.account_currency || "USD").toUpperCase();
    currencyCache.set(accountId, currency);
    return json.data.map((r) => ({
      date: String(r.date_start || "").slice(0, 10),
      spend: Number(r.spend || 0),
      currency,
    }));
  } catch (err) {
    console.warn(`[meta-api] fetch falhou act_${accountId}:`, err);
    return [];
  }
}

export async function getMetaSpendApi(market: Market, start: string, end: string): Promise<number> {
  const accountIds = META_ACCOUNT_IDS[market];
  const targetCurrency = market === "BR" ? "BRL" : "USD";
  let total = 0;
  for (const id of accountIds) {
    const rows = await fetchInsights(id, start, end);
    for (const r of rows) {
      const needsFx = r.currency === "USD" && targetCurrency === "BRL";
      const fx = needsFx ? await getFxRate(r.date.slice(0, 7)) : 1;
      total += r.spend * fx;
    }
  }
  return total;
}

export function hasMetaCredentials(): boolean {
  return !!token();
}

// Supermetrics client para Meta + Google Ads spend
// Source-of-truth do dashboard principal Larroude
// BQ é fallback quando Supermetrics falha
import type { Market } from "@/types/metric";

const SUPERMETRICS_API = "https://api.supermetrics.com/enterprise/v2/query";

const GADS_ACCOUNT_IDS: Record<Market, string[]> = {
  US: ["7244161860"],
  BR: ["4794620842"], // BRL nativo
};

// Meta accounts (todas reportam em USD; SOMENTE Larroude BR principal precisa conversao)
const META_ACCOUNTS_US: string[] = [
  "2047856822417350", // Larroude US
  "929449929417505",  // Pre-Order US
];

// BR Meta: cada conta especifica se precisa converter USD->BRL ou nao
// Conforme Cassia: Pre-Order BR ja esta em reais, so converter Larroude BR principal
const META_ACCOUNTS_BR: Array<{ id: string; convertFx: boolean }> = [
  { id: "1735567560524487", convertFx: true },   // Larroude BR (em USD - converter)
  { id: "1975682443187483", convertFx: false },  // Pre-Order BR (ja em BRL)
  { id: "756931007040325",  convertFx: false },  // Brand BR (assumir BRL)
];

const FX_USD_BRL_FALLBACK = 5.45;

async function fetchSupermetrics(params: Record<string, unknown>): Promise<{ data?: unknown[][] } | null> {
  const apiKey = process.env.SUPERMETRICS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `${SUPERMETRICS_API}?json=${encodeURIComponent(JSON.stringify(params))}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn(`supermetrics HTTP ${res.status}: ${txt.slice(0, 300)}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("supermetrics fetch failed:", err);
    return null;
  }
}

// Total spend Meta (somando todas contas, converte FX so onde aplicavel)
export async function getMetaSpend(market: Market, start: string, end: string): Promise<number> {
  if (market === "US") {
    const json = await fetchSupermetrics({
      ds_id: "FA",
      ds_accounts: META_ACCOUNTS_US,
      fields: "Date,Spend",
      date_range_type: "custom",
      start_date: start,
      end_date: end,
      max_rows: 5000,
    });
    if (!json?.data || json.data.length < 2) return 0;
    return json.data.slice(1).reduce((s, r) => s + Number((r as unknown[])[1] ?? 0), 0);
  }

  // BR: buscar por conta para aplicar FX seletivo
  let total = 0;
  for (const acc of META_ACCOUNTS_BR) {
    const json = await fetchSupermetrics({
      ds_id: "FA",
      ds_accounts: [acc.id],
      fields: "Date,Spend",
      date_range_type: "custom",
      start_date: start,
      end_date: end,
      max_rows: 5000,
    });
    if (!json?.data || json.data.length < 2) continue;
    const sub = json.data.slice(1).reduce((s, r) => s + Number((r as unknown[])[1] ?? 0), 0);
    total += acc.convertFx ? sub * FX_USD_BRL_FALLBACK : sub;
  }
  return total;
}

export async function getGoogleSpend(market: Market, start: string, end: string): Promise<number> {
  const accounts = GADS_ACCOUNT_IDS[market];
  const json = await fetchSupermetrics({
    ds_id: "AW",
    ds_accounts: accounts,
    fields: "Date,Cost",
    date_range_type: "custom",
    start_date: start,
    end_date: end,
    max_rows: 1000,
  });
  if (!json?.data || json.data.length < 2) return 0;
  return json.data.slice(1).reduce((s, r) => s + Number((r as unknown[])[1] ?? 0), 0);
}

export function hasSupermetricsCredentials(): boolean {
  return !!process.env.SUPERMETRICS_API_KEY;
}

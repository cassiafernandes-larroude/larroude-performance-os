/**
 * Spend + purchase value de HOJE (D0) por SKU de anúncio Meta — near real-time.
 *
 * Cassia 2026-06-19: "os anuncios são por sku. Mostre o roas dos skus que tem anuncios."
 * O nome do ad Meta carrega o mother SKU (ex.: Sale_..._L420-LOUL-BEIG-2695_Video_...).
 * Buscamos insights ad-level direto da Graph API (level=ad, time_range=hoje) e agregamos
 * spend/purchase_value por SKU extraído do nome (extractAdRefFromName).
 *
 * TODAS as contas (US e BR) são cobradas em USD (REGRAS-LARROUDE-OS 3.1) → para BR
 * convertemos spend e purchase_value USD→BRL via FX do mês (gold.fx_rates_monthly).
 */

import { extractAdRefFromName } from '@/lib/meta-ads-native/sku-extractor';
import { runQuery } from '@/lib/bigquery/client';
import { todayInMarket } from '@/lib/utils/market-tz';
import type { Market } from './queries';

const GRAPH = 'https://graph.facebook.com/v20.0';

// Contas por mercado (REGRAS-LARROUDE-OS 3.1) — mesmas do Main.
const ACCOUNT_IDS: Record<Market, string[]> = {
  US: ['2047856822417350', '929449929417505', '312869193575906'],
  BR: ['1735567560524487', '1975682443187483', '756931007040325'],
};

const FX_USD_BRL_FALLBACK = 5.0;

function token(): string | null {
  return (
    process.env.META_ACCESS_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN ||
    process.env.FB_ADS_ACCESS_TOKEN ||
    process.env.META_GRAPH_ACCESS_TOKEN ||
    null
  );
}

async function getFxUsdBrl(yyyymm: string): Promise<number> {
  try {
    const rows = await runQuery<{ avg_rate_brl_usd: number }>(
      `SELECT avg_rate_brl_usd FROM \`larroude-data-prod.gold.fx_rates_monthly\` WHERE month = @m LIMIT 1`,
      { m: yyyymm }
    );
    const rate = Number(rows?.[0]?.avg_rate_brl_usd);
    if (rate > 0 && rate < 20) return rate;
  } catch (err) {
    console.warn('[today-ad-spend] FX fetch falhou', yyyymm, (err as Error)?.message);
  }
  return FX_USD_BRL_FALLBACK;
}

export interface AdSkuSpend {
  spend: number;
  purchaseValue: number;
}

export interface TodayAdSpendResult {
  /** Chave = SKU extraído do nome do ad (pode ser genérico "L420" ou completo "L420-LOUL-BEIG-2695"). */
  spendBySku: Record<string, AdSkuSpend>;
  /** false quando o token Meta falhou em ≥1 conta (ROAS pode estar incompleto). */
  ok: boolean;
  fx: number;
  date: string;
  generatedAt: string;
}

async function fetchAccountToday(accountId: string, today: string): Promise<{ rows: any[]; ok: boolean }> {
  const tk = token();
  if (!tk) return { rows: [], ok: false };
  const timeRange = encodeURIComponent(JSON.stringify({ since: today, until: today }));
  const out: any[] = [];
  let url: string | null =
    `${GRAPH}/act_${accountId}/insights?level=ad&time_range=${timeRange}` +
    `&fields=ad_name,spend,action_values&limit=500&access_token=${tk}`;
  let pages = 0;
  try {
    while (url && pages < 10) {
      pages++;
      const r: Response = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        console.warn(`[today-ad-spend] HTTP ${r.status} act_${accountId}`);
        return { rows: out, ok: false };
      }
      const j: any = await r.json();
      if (Array.isArray(j.data)) out.push(...j.data);
      url = j.paging?.next ?? null;
    }
    return { rows: out, ok: true };
  } catch (err) {
    console.warn(`[today-ad-spend] fetch falhou act_${accountId}`, (err as Error)?.message);
    return { rows: out, ok: false };
  }
}

export async function getTodayAdSpendBySku(market: Market): Promise<TodayAdSpendResult> {
  const today = todayInMarket(market);
  const fx = market === 'BR' ? await getFxUsdBrl(today.slice(0, 7)) : 1;
  const spendBySku: Record<string, AdSkuSpend> = {};

  const tk = token();
  if (!tk) {
    return { spendBySku, ok: false, fx, date: today, generatedAt: new Date().toISOString() };
  }

  const results = await Promise.all(ACCOUNT_IDS[market].map((id) => fetchAccountToday(id, today)));
  let ok = true;
  for (const res of results) {
    if (!res.ok) ok = false;
    for (const row of res.rows) {
      const ref = extractAdRefFromName(row.ad_name);
      if (!ref || ref.type !== 'sku') continue; // só SKUs (collections não mapeiam pra mother SKU)
      const spend = (Number(row.spend) || 0) * fx;
      const pvRaw =
        (row.action_values || []).find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0;
      const purchaseValue = (Number(pvRaw) || 0) * fx;
      if (spend === 0 && purchaseValue === 0) continue;
      const acc = spendBySku[ref.value] || { spend: 0, purchaseValue: 0 };
      acc.spend += spend;
      acc.purchaseValue += purchaseValue;
      spendBySku[ref.value] = acc;
    }
  }

  return { spendBySku, ok, fx, date: today, generatedAt: new Date().toISOString() };
}

// Cassia 2026-06-22: "total investido" de uma ação do Calendário — spend dos anúncios Meta cujo nome
// carrega o SKU dos produtos da ação. Reusa o padrão do unit-economics/today-ad-spend (Graph API
// level=ad, extractAdRefFromName), generalizado para uma janela arbitrária.
// Todas as contas são cobradas em USD; BR converte via FX mensal (gold.fx_rates_monthly).

import { extractAdRefFromName } from '@/lib/meta-ads-native/sku-extractor';
import { runQuery } from '@/lib/ltv-dashboard/bigquery';
import type { Market } from './asana';

const GRAPH = 'https://graph.facebook.com/v20.0';

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

/**
 * SKU canônico (modelo+cor+estilo, SEM tamanho): L<nº>-MODELO-COR-ESTILO (ex.: L422-VERO-RICE-1839).
 * A variante do pedido traz o tamanho no índice 2 (ex.: L420-LOUL-5.0-BLAC-2985 → L420-LOUL-BLAC-2985).
 * Um SKU já canônico ou um SKU-mãe bruto (L422) passa inalterado.
 */
export function canonicalSku(sku: string | null | undefined): string {
  const parts = String(sku || '').toUpperCase().split('-');
  if (parts.length >= 5 && /^\d{1,2}(\.\d+)?$/.test(parts[2])) parts.splice(2, 1);
  return parts.join('-');
}

/** Casa um SKU canônico contra alvos canônicos: igual, ou alvo é prefixo de modelo+cor (mãe → todas as cores). */
export function skuInTargets(cano: string, targets: string[]): boolean {
  return targets.some((t) => cano === t || cano.startsWith(t + '-'));
}

async function getFxUsdBrl(yyyymm: string): Promise<number> {
  try {
    const rows = await runQuery<{ avg_rate_brl_usd: number }>(
      `SELECT avg_rate_brl_usd FROM \`larroude-data-prod.gold.fx_rates_monthly\` WHERE month = @m LIMIT 1`,
      { m: yyyymm }
    );
    const rate = Number(rows?.[0]?.avg_rate_brl_usd);
    if (rate > 0 && rate < 20) return rate;
  } catch {
    /* fallback abaixo */
  }
  return FX_USD_BRL_FALLBACK;
}

async function fetchAccountRange(accountId: string, since: string, until: string, tk: string): Promise<{ rows: any[]; ok: boolean }> {
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const out: any[] = [];
  let url: string | null =
    `${GRAPH}/act_${accountId}/insights?level=ad&time_range=${timeRange}` +
    `&fields=ad_name,spend&limit=500&access_token=${tk}`;
  let pages = 0;
  try {
    while (url && pages < 20) {
      pages++;
      const r: Response = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return { rows: out, ok: false };
      const j: any = await r.json();
      if (Array.isArray(j.data)) out.push(...j.data);
      url = j.paging?.next ?? null;
    }
    return { rows: out, ok: true };
  } catch {
    return { rows: out, ok: false };
  }
}

export interface AdSpendResult { spend: number; ok: boolean; }

/**
 * Soma o spend Meta na janela dos anúncios cujo nome carrega um SKU que casa com `targets`
 * (SKUs canônicos modelo+cor+estilo). `ok=false` quando o token Meta falta/expira (spend incompleto).
 */
/** Spend TOTAL de mídia Meta na janela (todos os anúncios, sem filtro de SKU) — para campanhas sitewide. */
export async function getTotalAdSpend(market: Market, since: string, until: string): Promise<AdSpendResult> {
  const tk = token();
  if (!tk) return { spend: 0, ok: false };
  const fx = market === 'BR' ? await getFxUsdBrl(since.slice(0, 7)) : 1;
  const results = await Promise.all(ACCOUNT_IDS[market].map((id) => fetchAccountRange(id, since, until, tk)));
  let ok = true;
  let spend = 0;
  for (const res of results) {
    if (!res.ok) ok = false;
    for (const row of res.rows) spend += (Number(row.spend) || 0) * fx;
  }
  return { spend, ok };
}

export async function getAdSpendForSkus(market: Market, since: string, until: string, targets: string[]): Promise<AdSpendResult> {
  if (!targets.length) return { spend: 0, ok: true };
  const tk = token();
  if (!tk) return { spend: 0, ok: false };
  const fx = market === 'BR' ? await getFxUsdBrl(since.slice(0, 7)) : 1;

  const results = await Promise.all(ACCOUNT_IDS[market].map((id) => fetchAccountRange(id, since, until, tk)));
  let ok = true;
  let spend = 0;
  for (const res of results) {
    if (!res.ok) ok = false;
    for (const row of res.rows) {
      const ref = extractAdRefFromName(row.ad_name);
      if (!ref || ref.type !== 'sku') continue;
      if (!skuInTargets(canonicalSku(ref.value), targets)) continue;
      spend += (Number(row.spend) || 0) * fx;
    }
  }
  return { spend, ok };
}

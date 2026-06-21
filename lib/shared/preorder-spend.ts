/**
 * Share de investimento PRE-ORDER (pré-lançamento) via Meta ad-level.
 *
 * Cassia 2026-06-20: identifica o investimento de pré-lançamento por DOIS sinais:
 *   (1) nome da CAMPANHA contém pre-order/pré-venda (PREORDER_CAMPAIGN_REGEX), OU
 *   (2) nome do ANÚNCIO contém um SKU cujo mother SKU está na coleção de pré-venda.
 * Retorna {total, preorder} em moeda nativa (USD) — usado como RAZÃO (share), então
 * FX é irrelevante. Pareia com Google (campaign-level) no cálculo do fator de spend.
 */

import { extractAdRefFromName } from '@/lib/meta-ads-native/sku-extractor';
import { isPreorderCampaign } from '@/lib/shared/fulfillment-category';
import type { Market } from '@/lib/unit-economics/queries';

const GRAPH = 'https://graph.facebook.com/v20.0';
const ACCOUNT_IDS: Record<Market, string[]> = {
  US: ['2047856822417350', '929449929417505', '312869193575906'],
  BR: ['1735567560524487', '1975682443187483', '756931007040325'],
};

function token(): string | null {
  return process.env.META_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || process.env.FB_ADS_ACCESS_TOKEN || process.env.META_GRAPH_ACCESS_TOKEN || null;
}

function motherSkuOf(sku: string | null): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  if (parts.length >= 4 && /^\d+(\.\d+)?$/.test(parts[2])) {
    if (parts.length >= 5 && parts[4]) return `${parts[0]}-${parts[1]}-${parts[3]}-${parts[4]}`;
    return `${parts[0]}-${parts[1]}-${parts[3]}`;
  }
  if (parts.length >= 4 && parts[3]) return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

// O SKU do anúncio (pode ser genérico "L420" ou mother completo) casa um mother pre-order?
function adSkuIsPreorder(adSku: string, preorderSet: Set<string>, preorderList: string[]): boolean {
  const m = motherSkuOf(adSku) || adSku;
  if (preorderSet.has(m) || preorderSet.has(adSku)) return true;
  // ad genérico (ex.: "L420") cobre variantes pre-order ("L420-LOUL-RAIN-2854")
  return preorderList.some((p) => p.startsWith(adSku + '-') || p.startsWith(m + '-'));
}

async function fetchAdRows(accountId: string, start: string, end: string): Promise<Array<{ ad_name: string; campaign_name: string; spend: number }>> {
  const tk = token();
  if (!tk) return [];
  const tr = encodeURIComponent(JSON.stringify({ since: start, until: end }));
  const out: Array<{ ad_name: string; campaign_name: string; spend: number }> = [];
  let url: string | null = `${GRAPH}/act_${accountId}/insights?level=ad&time_range=${tr}&fields=ad_name,campaign_name,spend&limit=500&access_token=${tk}`;
  let pages = 0;
  try {
    while (url && pages < 20) {
      pages++;
      const r: Response = await fetch(url, { next: { revalidate: 600 } });
      if (!r.ok) return out;
      const j: any = await r.json();
      if (Array.isArray(j.data)) {
        for (const row of j.data) out.push({ ad_name: String(row.ad_name || ''), campaign_name: String(row.campaign_name || ''), spend: Number(row.spend) || 0 });
      }
      url = j.paging?.next ?? null;
    }
  } catch { /* parcial */ }
  return out;
}

/** {total, preorder} de spend Meta (USD nativo) no período. preorder = regex campanha OU SKU do ad na coleção. */
export async function getMetaPreorderSpend(market: Market, start: string, end: string, preorderSkus: string[]): Promise<{ total: number; preorder: number }> {
  if (!token()) return { total: 0, preorder: 0 };
  const set = new Set(preorderSkus);
  const rowsByAcc = await Promise.all(ACCOUNT_IDS[market].map((id) => fetchAdRows(id, start, end)));
  let total = 0, preorder = 0;
  for (const rows of rowsByAcc) {
    for (const r of rows) {
      total += r.spend;
      const ref = extractAdRefFromName(r.ad_name);
      const bySku = ref?.type === 'sku' ? adSkuIsPreorder(ref.value, set, preorderSkus) : false;
      if (isPreorderCampaign(r.campaign_name) || bySku) preorder += r.spend;
    }
  }
  return { total, preorder };
}

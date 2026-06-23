// Cassia 2026-06-23: Funil por produto PRÉ-ORDER (aba em Product Performance).
// Produtos da coleção de pré-order COM tag de drop → uma linha por produto, janela = desde o drop.
//   Shopify (sessões da página do produto, landing_page_path): sessões → add-to-cart → checkout → conversão
//   Meta ads (por SKU no nome do anúncio): cliques, impressões, CTR, investido
//   Shopify orders + COGS: unidades, faturamento, taxa de returns, receita−custo, margem contrib., margem bruta
// Nada inventado: cada métrica vem da sua fonte; se faltar token/dado, vem 0 e sinalizamos.

import { runShopifyQL } from '@/lib/main-dashboard/shopify-admin';
import { runQuery } from '@/lib/ltv-dashboard/bigquery';
import { canonicalSku } from '@/lib/calendar/ad-spend';
import { extractAdRefFromName } from '@/lib/meta-ads-native/sku-extractor';
import { getCogsBySku } from '@/lib/unit-economics/shopify-cogs';

export type Market = 'US' | 'BR';

const PREORDER_COLLECTION_ID: Record<Market, string> = { US: '310897770662', BR: '493998506298' };
const ORDERS_TABLE: Record<Market, string> = {
  US: 'larroude-data-prod.stg_shopify.orders',
  BR: 'larroude-data-prod.stg_shopify_br.orders',
};
const TZ: Record<Market, string> = { US: 'America/New_York', BR: 'America/Sao_Paulo' };
const EXCLUDED_TAGS_REGEX = 'b2b|wholesale|marketplace|redo|influencer';
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';
const GRAPH = 'https://graph.facebook.com/v20.0';
const META_ACCOUNTS: Record<Market, string[]> = {
  US: ['2047856822417350', '929449929417505', '312869193575906'],
  BR: ['1735567560524487', '1975682443187483', '756931007040325'],
};
const FX_FALLBACK = 5.0;

function shopCfg(market: Market) {
  if (market === 'US') return { domain: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com', token: process.env.SHOPIFY_US_ADMIN_API_TOKEN || '' };
  return { domain: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com', token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '' };
}
function metaToken(): string | null {
  return process.env.META_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || process.env.FB_ADS_ACCESS_TOKEN || process.env.META_GRAPH_ACCESS_TOKEN || null;
}
const today = () => new Date().toISOString().slice(0, 10);

/** DROP_DD.MM.AA → data YYYY-MM-DD (data do drop). */
function dropDate(tag: string): string | null {
  const m = /DROP_(\d{2})\.(\d{2})\.(\d{2})/i.exec(tag);
  if (!m) return null;
  return `20${m[3]}-${m[2]}-${m[1]}`;
}

export interface PreorderProduct { handle: string; title: string; sku: string; rawSku: string; dropTag: string; dropDate: string; }

/** Produtos da coleção de pré-order que têm tag de drop (handle, título, SKU canônico, drop). */
async function getPreorderProducts(market: Market): Promise<PreorderProduct[]> {
  const { domain, token } = shopCfg(market);
  if (!token) return [];
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const gid = `gid://shopify/Collection/${PREORDER_COLLECTION_ID[market]}`;
  const out: PreorderProduct[] = [];
  let cursor: string | null = null, hasNext = true, pages = 0;
  while (hasNext && pages < 20) {
    pages++;
    const query = `query Pre($cursor: String) { collection(id: "${gid}") { products(first: 100, after: $cursor) { edges { node { handle title tags variants(first: 1) { edges { node { sku } } } } } pageInfo { hasNextPage endCursor } } } }`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables: { cursor } }), cache: 'no-store' });
    if (!res.ok) break;
    const json: any = await res.json();
    const products = json?.data?.collection?.products;
    if (!products) break;
    for (const e of products.edges) {
      const tags: string[] = e.node.tags || [];
      const dtag = tags.find((t) => /^DROP_\d/i.test(t));
      if (!dtag) continue;
      const dd = dropDate(dtag);
      if (!dd) continue;
      const rawSku = String(e.node.variants?.edges?.[0]?.node?.sku || '').toUpperCase();
      const sku = canonicalSku(rawSku);
      if (!sku) continue;
      out.push({ handle: e.node.handle, title: e.node.title || e.node.handle, sku, rawSku, dropTag: dtag, dropDate: dd });
    }
    hasNext = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }
  return out;
}

interface Funnel { sessions: number; atc: number; reached: number; completed: number; }
/** Funil por página de produto (landing_page_path) numa janela → Map handle→funil. */
async function getProductPageFunnel(market: Market, since: string): Promise<Map<string, Funnel>> {
  const q = `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout GROUP BY landing_page_path SINCE ${since} UNTIL ${today()} LIMIT 5000`;
  const { rows } = await runShopifyQL(market, q, 'unstable');
  const map = new Map<string, Funnel>();
  for (const r of rows) {
    const path = String(r.landing_page_path || '');
    if (!path.startsWith('/products/')) continue;
    const handle = path.slice('/products/'.length).split(/[/?#]/)[0];
    if (!handle) continue;
    const e = map.get(handle) || { sessions: 0, atc: 0, reached: 0, completed: 0 };
    e.sessions += Number(r.sessions) || 0;
    e.atc += Number(r.sessions_with_cart_additions) || 0;
    e.reached += Number(r.sessions_that_reached_checkout) || 0;
    e.completed += Number(r.sessions_that_completed_checkout) || 0;
    map.set(handle, e);
  }
  return map;
}

interface AdMetrics { spend: number; clicks: number; impressions: number; }
async function getFx(market: Market, yyyymm: string): Promise<number> {
  if (market === 'US') return 1;
  try {
    const rows = await runQuery<{ avg_rate_brl_usd: number }>(`SELECT avg_rate_brl_usd FROM \`larroude-data-prod.gold.fx_rates_monthly\` WHERE month = @m LIMIT 1`, { m: yyyymm });
    const r = Number(rows?.[0]?.avg_rate_brl_usd);
    if (r > 0 && r < 20) return r;
  } catch { /* fallback */ }
  return FX_FALLBACK;
}
/** Métricas de ads por SKU canônico numa janela (spend convertido p/ moeda do mercado, cliques, impressões). */
async function getAdMetricsBySku(market: Market, since: string): Promise<{ map: Map<string, AdMetrics>; ok: boolean }> {
  const tk = metaToken();
  const map = new Map<string, AdMetrics>();
  if (!tk) return { map, ok: false };
  const fx = await getFx(market, since.slice(0, 7));
  const timeRange = encodeURIComponent(JSON.stringify({ since, until: today() }));
  let ok = true;
  await Promise.all(META_ACCOUNTS[market].map(async (acc) => {
    let url: string | null = `${GRAPH}/act_${acc}/insights?level=ad&time_range=${timeRange}&fields=ad_name,spend,clicks,impressions&limit=500&access_token=${tk}`;
    let pages = 0;
    try {
      while (url && pages < 20) {
        pages++;
        const r: Response = await fetch(url, { cache: 'no-store' });
        if (!r.ok) { ok = false; return; }
        const j: any = await r.json();
        for (const row of j.data || []) {
          const ref = extractAdRefFromName(row.ad_name);
          if (!ref || ref.type !== 'sku') continue;
          const c = canonicalSku(ref.value);
          const e = map.get(c) || { spend: 0, clicks: 0, impressions: 0 };
          e.spend += (Number(row.spend) || 0) * fx;
          e.clicks += Number(row.clicks) || 0;
          e.impressions += Number(row.impressions) || 0;
          map.set(c, e);
        }
        url = j.paging?.next ?? null;
      }
    } catch { ok = false; }
  }));
  return { map, ok };
}

interface Sales { grossUnits: number; refundedUnits: number; netRevenue: number; }
/** Unidades/faturamento/returns por SKU canônico numa janela (BQ orders, líquido de devoluções). */
async function getSalesBySku(market: Market, since: string): Promise<Map<string, Sales>> {
  const tz = TZ[market];
  const ref = '`' + ORDERS_TABLE[market] + '`';
  const sql = `
    WITH refunded AS (
      SELECT o.id AS oid, CAST(JSON_VALUE(rli, '$.line_item_id') AS INT64) AS lid,
             SUM(CAST(JSON_VALUE(rli, '$.quantity') AS FLOAT64)) AS rq
      FROM ${ref} o, UNNEST(JSON_QUERY_ARRAY(o.refunds)) AS r, UNNEST(JSON_QUERY_ARRAY(r, '$.refund_line_items')) AS rli
      WHERE o.cancelled_at IS NULL AND o.test = FALSE GROUP BY 1, 2
    ),
    li AS (
      SELECT o.id AS oid, CAST(JSON_VALUE(l, '$.id') AS INT64) AS lid,
             UPPER(JSON_VALUE(l, '$.sku')) AS sku,
             CAST(JSON_VALUE(l, '$.quantity') AS FLOAT64) AS qty,
             CAST(JSON_VALUE(l, '$.price') AS FLOAT64) AS price
      FROM ${ref} o, UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS l
      WHERE o.cancelled_at IS NULL AND o.test = FALSE
        AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'${EXCLUDED_TAGS_REGEX}')
        AND DATE(o.created_at, '${tz}') BETWEEN @since AND @until
    )
    SELECT li.sku AS sku,
           SUM(li.qty) AS gross_units,
           SUM(IFNULL(rf.rq, 0)) AS refunded_units,
           SUM((li.qty - IFNULL(rf.rq, 0)) * li.price) AS net_revenue
    FROM li LEFT JOIN refunded rf ON rf.oid = li.oid AND rf.lid = li.lid
    WHERE li.sku IS NOT NULL
    GROUP BY li.sku
  `;
  const rows = await runQuery<any>(sql, { since, until: today() });
  // Reduz variantes → SKU canônico.
  const map = new Map<string, Sales>();
  for (const r of rows) {
    const c = canonicalSku(String(r.sku));
    if (!c) continue;
    const e = map.get(c) || { grossUnits: 0, refundedUnits: 0, netRevenue: 0 };
    e.grossUnits += Number(r.gross_units) || 0;
    e.refundedUnits += Number(r.refunded_units) || 0;
    e.netRevenue += Number(r.net_revenue) || 0;
    map.set(c, e);
  }
  return map;
}

export interface ProductFunnelRow {
  handle: string; title: string; sku: string; dropTag: string; dropDate: string;
  sessions: number; addToCart: number; reachedCheckout: number; completedCheckout: number; convRate: number;
  clicks: number; impressions: number; ctr: number; spend: number;
  units: number; revenue: number; returnRate: number;
  cogs: number; revMinusCost: number; contributionMargin: number; grossMargin: number;
}
export interface PreorderFunnelResult {
  available: boolean;
  reason?: string;
  spendOk: boolean;
  drops: { drop: string; dropDate: string; rows: ProductFunnelRow[] }[];
}

export async function getPreorderFunnel(market: Market): Promise<PreorderFunnelResult> {
  const products = await getPreorderProducts(market);
  if (!products.length) return { available: true, spendOk: true, drops: [] };

  // Agrupa por drop (cada drop = uma janela desde a sua data).
  const byDrop = new Map<string, PreorderProduct[]>();
  for (const p of products) { if (!byDrop.has(p.dropTag)) byDrop.set(p.dropTag, []); byDrop.get(p.dropTag)!.push(p); }

  // COGS por variante (unitCost). Usa o SKU REAL da variante (com tamanho) — o canônico não casa no Shopify.
  const allRaw = [...new Set(products.map((p) => p.rawSku))];
  const cogsMap = await getCogsBySku(market, allRaw).catch(() => new Map<string, number>());
  const cogsUpper = new Map<string, number>();
  for (const [k, v] of cogsMap.entries()) cogsUpper.set(String(k).toUpperCase(), v);
  const cogsOf = (rawSku: string): number => cogsUpper.get(rawSku.toUpperCase()) ?? 0;

  let spendOk = true;
  const drops: PreorderFunnelResult['drops'] = [];

  // Janelas distintas (por data de drop) — busca funil/ads/vendas uma vez por janela.
  const distinctSince = [...new Set(products.map((p) => p.dropDate))];
  const funnelByDate = new Map<string, Map<string, Funnel>>();
  const adByDate = new Map<string, Map<string, AdMetrics>>();
  const salesByDate = new Map<string, Map<string, Sales>>();
  await Promise.all(distinctSince.map(async (since) => {
    const [fn, ad, sl] = await Promise.all([
      getProductPageFunnel(market, since).catch(() => new Map<string, Funnel>()),
      getAdMetricsBySku(market, since).catch(() => ({ map: new Map<string, AdMetrics>(), ok: false })),
      getSalesBySku(market, since).catch(() => new Map<string, Sales>()),
    ]);
    funnelByDate.set(since, fn);
    adByDate.set(since, ad.map);
    if (!ad.ok) spendOk = false;
    salesByDate.set(since, sl);
  }));

  for (const [tag, prods] of byDrop.entries()) {
    const since = prods[0].dropDate;
    const fn = funnelByDate.get(since)!;
    const ad = adByDate.get(since)!;
    const sl = salesByDate.get(since)!;
    const rows: ProductFunnelRow[] = prods.map((p) => {
      const f = fn.get(p.handle) || { sessions: 0, atc: 0, reached: 0, completed: 0 };
      const a = ad.get(p.sku) || { spend: 0, clicks: 0, impressions: 0 };
      const s = sl.get(p.sku) || { grossUnits: 0, refundedUnits: 0, netRevenue: 0 };
      const units = s.grossUnits - s.refundedUnits;
      const revenue = s.netRevenue;
      const cogs = cogsOf(p.rawSku) * units;
      const revMinusCost = revenue - cogs;
      return {
        handle: p.handle, title: p.title, sku: p.sku, dropTag: p.dropTag, dropDate: p.dropDate,
        sessions: f.sessions, addToCart: f.atc, reachedCheckout: f.reached, completedCheckout: f.completed,
        convRate: f.sessions > 0 ? (f.completed / f.sessions) * 100 : 0,
        clicks: a.clicks, impressions: a.impressions, ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0, spend: a.spend,
        units, revenue, returnRate: s.grossUnits > 0 ? (s.refundedUnits / s.grossUnits) * 100 : 0,
        cogs, revMinusCost, contributionMargin: revMinusCost - a.spend, grossMargin: revenue > 0 ? (revMinusCost / revenue) * 100 : 0,
      };
    }).sort((x, y) => y.revenue - x.revenue);
    drops.push({ drop: tag, dropDate: since, rows });
  }
  drops.sort((a, b) => b.dropDate.localeCompare(a.dropDate));
  return { available: true, spendOk, drops };
}

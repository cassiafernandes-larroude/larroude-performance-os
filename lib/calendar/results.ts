// Cassia 2026-06-22: motor de resultado das ações do Calendário — DIRETO DO SHOPIFY (Admin GraphQL),
// não do espelho BQ (decisão da Cássia: "cruzar com os dados direto do shopify").
// Dado (mercado, janela, SKUs | Collection ID) → GMV + unidades + pedidos.
// - SKUs: casa por prefixo (startsWith) → um SKU-mãe "L123-456" captura todas as variações/tamanhos.
// - Collection ID: resolve a collection → SKUs das variações via Shopify Admin, e cai no mesmo caminho.
// Exclui cancelados/test, VOIDED/REFUNDED e tags não-DTC (mesma regra do shopify-sales28d).
// Cada (mercado, janela) é escaneado UMA vez e cacheado em memória (~5min), pois várias ações
// compartilham período (ex.: ADS/CRM da mesma semana).

import type { Market } from './asana';
import { getAdSpendForSkus, getTotalAdSpend, canonicalSku, skuInTargets } from './ad-spend';
import { runShopifyQL } from '@/lib/main-dashboard/shopify-admin';
import { getFrozenCollectionSkus } from './collection-snapshots';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';
function shopifyConfig(market: Market) {
  if (market === 'US') {
    return {
      domain: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com',
      token: process.env.SHOPIFY_US_ADMIN_API_TOKEN || '',
    };
  }
  return {
    domain: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com',
    token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '',
  };
}

function shopUrl(market: Market) {
  const { domain } = shopifyConfig(market);
  return `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}
function shopToken(market: Market) {
  const { token } = shopifyConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN não configurado`);
  return token;
}

const EXCLUDED_TAGS = /b2b|wholesale|marketplace|redo|influencer|exchange-only/i;

export interface ActionResult {
  gmv: number;
  units: number;
  orders: number;
  basis: 'sku' | 'collection' | 'tag' | 'sitewide';
  skuCount: number;          // nº de SKUs-mãe (produtos) considerados (0 quando basis=sitewide)
  tag?: string;              // tag de produto usada quando basis=tag (ex.: DROP_17.06.26)
  spend: number;             // total investido (ads Meta cujo nome casa os SKUs)
  spendOk: boolean;          // false quando o token Meta falta/expira (investido incompleto)
  roas: number | null;       // faturamento / investido (null se sem spend)
  window: { start: string; end: string };
  partial: boolean;          // true se o scan do Shopify bateu no limite de tempo/páginas
  frozen?: boolean;          // basis=collection: true se usou a composição congelada da janela;
                             // false = caiu no membership ATUAL (sem snapshot p/ a janela)
}

// ---------- line items da janela (escaneados do Shopify, cacheados) ----------
interface WindowLine { orderId: string; sku: string; qty: number; revenue: number; }
interface WindowData { lines: WindowLine[]; partial: boolean; }

const linesCache = new Map<string, { ts: number; data: WindowData }>();
const LINES_TTL = 5 * 60 * 1000;

const ORDERS_QUERY = `
  query CalOrders($cursor: String, $query: String!) {
    orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT) {
      edges {
        node {
          id
          cancelledAt
          test
          displayFinancialStatus
          tags
          customer { tags }
          lineItems(first: 50) {
            edges {
              node {
                sku
                quantity
                discountedUnitPriceSet { shopMoney { amount } }
                originalUnitPriceSet { shopMoney { amount } }
                variant { sku }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const DTC_EXCLUSIONS = '-tag:b2b AND -tag:wholesale AND -tag:marketplace AND -tag:Exchange-Only AND -tag:influencer';

/** Escaneia os line items DTC de TODOS os pedidos que casam com um filtro Shopify (cacheado por mercado+filtro). */
async function fetchOrderLines(market: Market, queryFilter: string, timeoutMs = 25_000): Promise<WindowData> {
  const key = `${market}:${queryFilter}`;
  const hit = linesCache.get(key);
  if (hit && Date.now() - hit.ts < LINES_TTL) return hit.data;

  const url = shopUrl(market);
  const token = shopToken(market);
  const lines: WindowLine[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  let partial = false;
  const MAX_PAGES = 200;
  const t0 = Date.now();

  while (hasNext && pages < MAX_PAGES) {
    if (Date.now() - t0 > timeoutMs) { partial = true; break; }
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: ORDERS_QUERY, variables: { cursor, query: queryFilter } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify orders ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify orders errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const orders = json.data?.orders;
    if (!orders) break;
    for (const edge of orders.edges) {
      const o = edge.node;
      if (o.cancelledAt || o.test) continue;
      const fs = (o.displayFinancialStatus || '').toUpperCase();
      if (fs === 'VOIDED' || fs === 'REFUNDED') continue;
      const tags = (o.tags || []).concat(o.customer?.tags || []).join(' ').toLowerCase();
      if (EXCLUDED_TAGS.test(tags)) continue;
      for (const li of o.lineItems.edges) {
        const sku = (li.node.variant?.sku ?? li.node.sku) || '';
        const qty = Number(li.node.quantity) || 0;
        if (qty <= 0) continue;
        const disc = parseFloat(li.node.discountedUnitPriceSet?.shopMoney?.amount || '0') || 0;
        const orig = parseFloat(li.node.originalUnitPriceSet?.shopMoney?.amount || '0') || 0;
        const price = disc > 0 ? disc : orig;
        lines.push({ orderId: o.id, sku: sku.toUpperCase(), qty, revenue: price * qty });
      }
    }
    hasNext = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  const data: WindowData = { lines, partial };
  linesCache.set(key, { ts: Date.now(), data });
  return data;
}

/** Agrega GMV/unidades/pedidos da janela para os SKUs cujo SKU canônico (modelo+cor) casa os alvos. */
async function salesByCanonical(market: Market, start: string, end: string, targets: string[]): Promise<{ gmv: number; units: number; orders: number; partial: boolean }> {
  if (!targets.length) return { gmv: 0, units: 0, orders: 0, partial: false };
  // created_at em data (Shopify interpreta no fuso da loja, que casa com o mercado).
  const filter = `created_at:>=${start} created_at:<=${end} AND ${DTC_EXCLUSIONS}`;
  const { lines, partial } = await fetchOrderLines(market, filter);
  let gmv = 0, units = 0;
  const orderIds = new Set<string>();
  for (const l of lines) {
    if (!l.sku || !skuInTargets(canonicalSku(l.sku), targets)) continue;
    units += l.qty;
    gmv += l.revenue;
    orderIds.add(l.orderId);
  }
  return { gmv, units, orders: orderIds.size, partial };
}

/**
 * Vendas do SITE INTEIRO na janela — para campanhas sitewide. Usa o ShopifyQL `sales` (número oficial
 * Shopify, completo e near-real-time): faturamento = total_sales (= net − returns + impostos + frete),
 * unidades = net_items_sold, pedidos = orders. (Loja inteira, não filtra DTC — "todo o site".)
 */
async function salesAllSite(market: Market, start: string, end: string): Promise<{ gmv: number; units: number; orders: number; partial: boolean }> {
  const q = `FROM sales SHOW gross_sales, total_sales, net_items_sold, orders SINCE ${start} UNTIL ${end}`;
  const { rows, error } = await runShopifyQL(market, q, 'unstable');
  if (error) throw new Error(`ShopifyQL sales sitewide: ${error}`);
  const r = rows[0] || {};
  return {
    gmv: Number(r.total_sales) || 0,
    units: Number(r.net_items_sold) || 0,
    orders: Number(r.orders) || 0,
    partial: false,
  };
}

const COLLECTION_QUERY = `
  query CollSkus($id: ID!, $cursor: String) {
    collection(id: $id) {
      products(first: 100, after: $cursor) {
        edges { node { variants(first: 100) { edges { node { sku } } } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const PRODUCTS_BY_TAG_QUERY = `
  query ProdSkusByTag($q: String!, $cursor: String) {
    products(first: 50, query: $q, after: $cursor) {
      edges { node { variants(first: 100) { edges { node { sku } } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/** Resolve uma tag de PRODUTO (ex.: DROP_17.06.26) → lista de SKUs das variações dos produtos do drop. */
async function productSkusByTag(market: Market, tag: string): Promise<string[]> {
  const url = shopUrl(market);
  const token = shopToken(market);
  const skus = new Set<string>();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 50) {
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: PRODUCTS_BY_TAG_QUERY, variables: { q: `tag:${tag}`, cursor } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify products ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify products errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const products = json.data?.products;
    if (!products) break;
    for (const pe of products.edges) {
      for (const ve of pe.node.variants?.edges || []) {
        const sku = ve.node?.sku;
        if (sku) skus.add(String(sku).toUpperCase());
      }
    }
    hasNext = products.pageInfo?.hasNextPage;
    cursor = products.pageInfo?.endCursor || null;
  }
  return [...skus];
}

const DROP_PRODUCTS_QUERY = `
  query DropProds($q: String!, $cursor: String) {
    products(first: 50, query: $q, after: $cursor) {
      edges { node { title variants(first: 1) { edges { node { sku } } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export interface DropProduct { title: string; sku: string; units?: number; revenue?: number; }

/** Vendas (unidades + faturamento) por SKU canônico numa janela — p/ detalhar a lista do drop. */
export async function salesPerCanonicalSku(market: Market, start: string, end: string, targets: string[]): Promise<Map<string, { units: number; revenue: number }>> {
  const out = new Map<string, { units: number; revenue: number }>();
  if (!targets.length) return out;
  const filter = `created_at:>=${start} created_at:<=${end} AND ${DTC_EXCLUSIONS}`;
  const { lines } = await fetchOrderLines(market, filter);
  for (const l of lines) {
    if (!l.sku) continue;
    const c = canonicalSku(l.sku);
    if (!skuInTargets(c, targets)) continue;
    const e = out.get(c) || { units: 0, revenue: 0 };
    e.units += l.qty;
    e.revenue += l.revenue;
    out.set(c, e);
  }
  return out;
}

/** Lista os produtos de um drop (por tag de produto): título + SKU canônico (modelo+cor+estilo). */
export async function getDropProducts(market: Market, tag: string): Promise<DropProduct[]> {
  const url = shopUrl(market);
  const token = shopToken(market);
  const out: DropProduct[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 50) {
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: DROP_PRODUCTS_QUERY, variables: { q: `tag:${tag}`, cursor } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify products ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify products errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const products = json.data?.products;
    if (!products) break;
    for (const pe of products.edges) {
      const firstSku = pe.node.variants?.edges?.[0]?.node?.sku || '';
      const sku = canonicalSku(firstSku);
      const title = pe.node.title || '(sem título)';
      const key = sku || title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, sku });
    }
    hasNext = products.pageInfo?.hasNextPage;
    cursor = products.pageInfo?.endCursor || null;
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

const COLLECTION_PRODUCTS_QUERY = `
  query CollProds($id: ID!, $cursor: String) {
    collection(id: $id) {
      products(first: 50, after: $cursor) {
        edges { node { title variants(first: 1) { edges { node { sku } } } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

/** Lista os produtos de uma collection: título + SKU canônico. */
export async function getCollectionProducts(market: Market, collectionId: string): Promise<DropProduct[]> {
  const url = shopUrl(market);
  const token = shopToken(market);
  const gid = `gid://shopify/Collection/${collectionId}`;
  const out: DropProduct[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 50) {
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: COLLECTION_PRODUCTS_QUERY, variables: { id: gid, cursor } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify collection ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify collection errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const products = json.data?.collection?.products;
    if (!products) break;
    for (const pe of products.edges) {
      const sku = canonicalSku(pe.node.variants?.edges?.[0]?.node?.sku || '');
      const title = pe.node.title || '(sem título)';
      const key = sku || title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, sku });
    }
    hasNext = products.pageInfo?.hasNextPage;
    cursor = products.pageInfo?.endCursor || null;
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** Resolve uma collection Shopify → lista de SKUs das variações (composição ATUAL, ao vivo). */
export async function collectionSkus(market: Market, collectionId: string): Promise<string[]> {
  const url = shopUrl(market);
  const token = shopToken(market);
  const gid = `gid://shopify/Collection/${collectionId}`;
  const skus = new Set<string>();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 50) {
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: COLLECTION_QUERY, variables: { id: gid, cursor } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify collection ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify collection errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const products = json.data?.collection?.products;
    if (!products) break;
    for (const pe of products.edges) {
      for (const ve of pe.node.variants?.edges || []) {
        const sku = ve.node?.sku;
        if (sku) skus.add(String(sku).toUpperCase());
      }
    }
    hasNext = products.pageInfo?.hasNextPage;
    cursor = products.pageInfo?.endCursor || null;
  }
  return [...skus];
}

/** Reduz uma lista de SKUs (variantes/mães) a SKUs canônicos distintos (modelo+cor+estilo, sem tamanho). */
export function toCanonical(skus: string[]): string[] {
  const out = new Set<string>();
  for (const s of skus) { const c = canonicalSku(s); if (c) out.add(c); }
  return [...out];
}

/**
 * Resultado de uma ação. Prioridade do vínculo: Collection ID (manual) > SKUs (manual) > tag de drop (auto).
 * Em todos os casos resolve os produtos → SKUs-mãe e mede no Shopify ao vivo na janela:
 *   - unidades + faturamento (linhas dos pedidos cujos SKUs casam)
 *   - investido (spend dos ads Meta cujo nome carrega esses SKUs-mãe) → ROAS
 */
export async function getActionResult(
  market: Market,
  start: string,
  end: string,
  link: { skus: string[]; collectionId: string | null; dropTag?: string | null; sitewide?: boolean }
): Promise<ActionResult | null> {
  // Campanha SITE INTEIRO: mede vendas DTC de todo o site na janela + spend total de mídia (ROAS).
  if (link.sitewide) {
    const sales = await salesAllSite(market, start, end);
    const ad = await getTotalAdSpend(market, start, end).catch(() => ({ spend: 0, ok: false }));
    return {
      ...sales, basis: 'sitewide', skuCount: 0,
      spend: ad.spend, spendOk: ad.ok,
      roas: ad.spend > 0 ? sales.gmv / ad.spend : null,
      window: { start, end },
    };
  }
  let basis: 'sku' | 'collection' | 'tag';
  let rawSkus: string[];
  let tag: string | undefined;
  let frozen: boolean | undefined;
  if (link.skus.length) {
    // Cassia 2026-06-29: SKUs do campo "SKUs" do Asana são a fonte explícita e imutável da campanha
    // e têm PRIORIDADE sobre Collection ID (mutável). Decisão da Cássia: "sempre vou inserir os skus
    // no campo de sku" — assim a lista preenchida na tarefa manda, não a composição da coleção.
    basis = 'sku';
    rawSkus = link.skus;
  } else if (link.collectionId) {
    basis = 'collection';
    // Fallback quando não há SKUs manuais: composição da collection NA JANELA da campanha (congelada
    // no KV pelo cron), não a de hoje — collection editada depois mudaria os SKUs medidos. Sem snapshot
    // p/ a janela (campanha antiga), cai no membership ATUAL e marca frozen=false para a UI sinalizar.
    const frozenSkus = await getFrozenCollectionSkus(market, link.collectionId, end).catch(() => [] as string[]);
    if (frozenSkus.length) {
      rawSkus = frozenSkus;
      frozen = true;
    } else {
      rawSkus = await collectionSkus(market, link.collectionId);
      frozen = false;
    }
  } else if (link.dropTag) {
    basis = 'tag';
    tag = link.dropTag;
    rawSkus = await productSkusByTag(market, link.dropTag);
  } else {
    return null;
  }

  // Tudo casa pelo SKU canônico (modelo+cor+estilo, ex.: L422-VERO-RICE-1839) — preciso por cor,
  // não mistura cores do mesmo modelo. Vendas: canônico do SKU da linha do pedido. Investido: canônico
  // do SKU extraído do nome do anúncio.
  const targets = toCanonical(rawSkus);
  const sales = await salesByCanonical(market, start, end, targets);
  const ad = await getAdSpendForSkus(market, start, end, targets).catch(() => ({ spend: 0, ok: false }));
  return {
    ...sales,
    basis,
    skuCount: targets.length,
    tag,
    spend: ad.spend,
    spendOk: ad.ok,
    roas: ad.spend > 0 ? sales.gmv / ad.spend : null,
    window: { start, end },
    frozen,
  };
}

/** Janela de medição de uma ação. Drop (só due) → due..due+14d; com range → start..due. */
export function actionWindow(startOn: string | null, dueOn: string | null): { start: string; end: string } | null {
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (startOn && dueOn) return { start: startOn, end: dueOn };
  if (dueOn) return { start: dueOn, end: addDays(dueOn, 14) };
  if (startOn) return { start: startOn, end: addDays(startOn, 14) };
  return null;
}

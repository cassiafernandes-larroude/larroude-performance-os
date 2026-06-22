// Cassia 2026-06-22: motor de resultado das ações do Calendário.
// Dado (mercado, janela, SKUs | Collection ID) → GMV + unidades + pedidos, do BigQuery (orders mirror).
// - SKUs: casa por prefixo (STARTS_WITH), então um SKU-mãe "L123-456" captura todas as variações/tamanhos.
// - Collection ID: resolve a collection → SKUs das variações via Shopify Admin GraphQL, e cai no mesmo caminho.
// Líquido de devoluções (refunds[].refund_line_items). Filtros DTC iguais aos demais dashboards.

import { runQuery } from '@/lib/ltv-dashboard/bigquery';
import type { Market } from './asana';

const ORDERS_TABLE: Record<Market, string> = {
  US: 'larroude-data-prod.stg_shopify.orders',
  BR: 'larroude-data-prod.stg_shopify_br.orders',
};
const TZ: Record<Market, string> = { US: 'America/New_York', BR: 'America/Sao_Paulo' };
const EXCLUDED_TAGS_REGEX = 'b2b|wholesale|marketplace|redo|influencer';

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

export interface ActionResult {
  gmv: number;
  units: number;
  orders: number;
  basis: 'sku' | 'collection';
  skuCount: number;        // nº de SKUs/prefixos considerados
  window: { start: string; end: string };
}

/** GMV/unidades/pedidos líquidos para uma lista de prefixos de SKU numa janela. */
async function salesBySkuPrefixes(market: Market, start: string, end: string, prefixes: string[]): Promise<{ gmv: number; units: number; orders: number }> {
  if (!prefixes.length) return { gmv: 0, units: 0, orders: 0 };
  const tz = TZ[market];
  const ref = '`' + ORDERS_TABLE[market] + '`';
  const sql = `
    WITH refunded AS (
      SELECT o.id AS order_id,
             CAST(JSON_VALUE(rli, '$.line_item_id') AS INT64) AS lid,
             SUM(CAST(JSON_VALUE(rli, '$.quantity') AS FLOAT64)) AS rq
      FROM ${ref} o,
        UNNEST(JSON_QUERY_ARRAY(o.refunds)) AS r,
        UNNEST(JSON_QUERY_ARRAY(r, '$.refund_line_items')) AS rli
      WHERE o.cancelled_at IS NULL AND o.test = FALSE
      GROUP BY 1, 2
    ),
    li AS (
      SELECT o.id AS order_id,
             CAST(JSON_VALUE(l, '$.id') AS INT64) AS lid,
             UPPER(JSON_VALUE(l, '$.sku')) AS sku,
             CAST(JSON_VALUE(l, '$.quantity') AS FLOAT64) AS qty,
             CAST(JSON_VALUE(l, '$.price') AS FLOAT64) AS price
      FROM ${ref} o,
        UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS l
      WHERE o.cancelled_at IS NULL AND o.test = FALSE
        AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'${EXCLUDED_TAGS_REGEX}')
        AND DATE(o.created_at, '${tz}') BETWEEN @start AND @end
    ),
    net AS (
      SELECT li.order_id, li.sku, li.price, li.qty - IFNULL(rf.rq, 0) AS net_qty
      FROM li LEFT JOIN refunded rf ON rf.order_id = li.order_id AND rf.lid = li.lid
      WHERE li.sku IS NOT NULL AND li.qty - IFNULL(rf.rq, 0) > 0
        AND EXISTS (SELECT 1 FROM UNNEST(@prefixes) p WHERE STARTS_WITH(li.sku, p))
    )
    SELECT
      IFNULL(SUM(net_qty), 0) AS units,
      IFNULL(SUM(net_qty * price), 0) AS gmv,
      COUNT(DISTINCT order_id) AS orders
    FROM net
  `;
  const rows = await runQuery<any>(sql, { start, end, prefixes: prefixes.map((p) => p.toUpperCase()) });
  const r = rows[0] || {};
  return { gmv: Number(r.gmv) || 0, units: Number(r.units) || 0, orders: Number(r.orders) || 0 };
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

/** Resolve uma collection Shopify → lista de SKUs das variações. */
async function collectionSkus(market: Market, collectionId: string): Promise<string[]> {
  const { domain, token } = shopifyConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN não configurado`);
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
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

/** Resultado de uma ação: usa Collection ID se houver, senão SKUs. */
export async function getActionResult(
  market: Market,
  start: string,
  end: string,
  link: { skus: string[]; collectionId: string | null }
): Promise<ActionResult | null> {
  if (link.collectionId) {
    const skus = await collectionSkus(market, link.collectionId);
    const sales = await salesBySkuPrefixes(market, start, end, skus);
    return { ...sales, basis: 'collection', skuCount: skus.length, window: { start, end } };
  }
  if (link.skus.length) {
    const sales = await salesBySkuPrefixes(market, start, end, link.skus);
    return { ...sales, basis: 'sku', skuCount: link.skus.length, window: { start, end } };
  }
  return null;
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

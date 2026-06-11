/**
 * Taxa de troca (REDO/exchange) por produto — janela 30 dias.
 *
 * Cassia 2026-06-10: "calcule o custo de troca, media dos ultimos 30 dias"
 *
 * Larroude usa tag `Exchange-Only` no Shopify pra orders que substituem outra (troca sem reembolso).
 * exchangeRate por mother SKU = exchange_units / total_units no período de 30d.
 * O custo monetário é calculado no cascade: rate × (shipping + fulfillment).
 *
 * Validação 2026-06-11: amostra 100 orders recentes → 28 com tag `Exchange-Only`
 * (e 28 com `policy:exchange-only`). A tag `redo` NAO existe na base Larroude.
 */

import type { Market } from './queries';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function getConfig(market: Market) {
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

const REDO_QUERY = `
  query Redos($cursor: String, $query: String!) {
    orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          cancelledAt
          test
          tags
          lineItems(first: 50) {
            edges {
              node {
                sku
                quantity
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

function motherSkuOf(sku: string | null): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  if (parts.length >= 4 && /^\d+(\.\d+)?$/.test(parts[2])) {
    if (parts.length >= 5 && parts[4]) {
      return `${parts[0]}-${parts[1]}-${parts[3]}-${parts[4]}`;
    }
    return `${parts[0]}-${parts[1]}-${parts[3]}`;
  }
  if (parts.length >= 4 && parts[3]) {
    return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
  }
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

export interface ExchangeRateMap {
  /** redo units / total units no período por mother SKU */
  byMother: Map<string, { redoUnits: number; totalUnits: number; exchangeRate: number }>;
  byVariant: Map<string, { redoUnits: number; totalUnits: number; exchangeRate: number }>;
  /** taxa agregada do market */
  overallRate: number;
  overallRedoUnits: number;
  overallTotalUnits: number;
  pages: number;
  partial: boolean;
}

export async function getExchangeRatesLast30d(
  market: Market,
  endDate: string,
  timeoutMs: number = 60_000
): Promise<ExchangeRateMap> {
  const { domain, token } = getConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);
  const t0 = Date.now();

  const end = new Date(endDate + 'T23:59:59Z');
  const start = new Date(end.getTime() - 29 * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = endDate;

  // 2 queries: (a) units regulares (sem Exchange-Only), (b) units com Exchange-Only
  const baseFilter = `created_at:>=${startISO}T00:00:00Z AND created_at:<=${endISO}T23:59:59Z AND -tag:b2b AND -tag:wholesale AND -tag:marketplace AND -tag:influencer`;
  const totalFilter = `${baseFilter} AND -tag:Exchange-Only`; // SEM exchange
  const redoFilter = `${baseFilter} AND tag:Exchange-Only`;   // SO exchange

  async function countUnits(filter: string, label: string) {
    const motherMap = new Map<string, number>();
    const variantMap = new Map<string, number>();
    let cursor: string | null = null;
    let hasNext = true;
    let pages = 0;
    let partial = false;
    const MAX_PAGES = 200;
    const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
    while (hasNext && pages < MAX_PAGES) {
      if (Date.now() - t0 > timeoutMs) {
        partial = true;
        break;
      }
      pages++;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query: REDO_QUERY, variables: { cursor, query: filter } }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Shopify ${label} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as any;
      if (json.errors?.length) throw new Error(`Shopify ${label} errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
      const orders = json.data?.orders;
      if (!orders) break;
      for (const edge of orders.edges) {
        const o = edge.node;
        if (o.cancelledAt || o.test) continue;
        for (const li of o.lineItems.edges) {
          const sku = li.node.variant?.sku ?? li.node.sku;
          if (!sku) continue;
          const qty = Number(li.node.quantity) || 0;
          if (qty <= 0) continue;
          const mSku = motherSkuOf(sku);
          if (!mSku) continue;
          if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;
          motherMap.set(mSku, (motherMap.get(mSku) || 0) + qty);
          const vKey = `${mSku}|${sku}`;
          variantMap.set(vKey, (variantMap.get(vKey) || 0) + qty);
        }
      }
      hasNext = orders.pageInfo.hasNextPage;
      cursor = orders.pageInfo.endCursor;
    }
    return { motherMap, variantMap, pages, partial };
  }

  const [regular, redo] = await Promise.all([
    countUnits(totalFilter, 'total'),
    countUnits(redoFilter, 'redo'),
  ]);

  // Build maps:
  // total_units = regular + redo (denominador da taxa)
  // redo_units = redo (numerador)
  const motherKeys = new Set([...regular.motherMap.keys(), ...redo.motherMap.keys()]);
  const variantKeys = new Set([...regular.variantMap.keys(), ...redo.variantMap.keys()]);

  const byMother = new Map<string, { redoUnits: number; totalUnits: number; exchangeRate: number }>();
  for (const k of motherKeys) {
    const reg = regular.motherMap.get(k) || 0;
    const r = redo.motherMap.get(k) || 0;
    const total = reg + r;
    byMother.set(k, { redoUnits: r, totalUnits: total, exchangeRate: total > 0 ? r / total : 0 });
  }
  const byVariant = new Map<string, { redoUnits: number; totalUnits: number; exchangeRate: number }>();
  for (const k of variantKeys) {
    const reg = regular.variantMap.get(k) || 0;
    const r = redo.variantMap.get(k) || 0;
    const total = reg + r;
    byVariant.set(k, { redoUnits: r, totalUnits: total, exchangeRate: total > 0 ? r / total : 0 });
  }

  let overallRedo = 0;
  let overallTotal = 0;
  for (const v of byMother.values()) {
    overallRedo += v.redoUnits;
    overallTotal += v.totalUnits;
  }
  const overallRate = overallTotal > 0 ? overallRedo / overallTotal : 0;

  console.log(
    `[ue-exch30d ${market}] regular=${regular.pages}p redo=${redo.pages}p mothers=${byMother.size} variants=${byVariant.size} overall=${(overallRate * 100).toFixed(2)}% (${overallRedo}/${overallTotal}) partial=${regular.partial || redo.partial} ${Date.now() - t0}ms`
  );

  return {
    byMother,
    byVariant,
    overallRate,
    overallRedoUnits: overallRedo,
    overallTotalUnits: overallTotal,
    pages: regular.pages + redo.pages,
    partial: regular.partial || redo.partial,
  };
}

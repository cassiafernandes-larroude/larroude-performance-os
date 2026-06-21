// Cliente Shopify Admin GraphQL — busca sessions + CVR direto do Shopify
// (mesma fonte da página Início do Admin: "Sessões" + "Taxa de conversão")
//
// Auth: SHOPIFY_{US|BR}_ADMIN_API_TOKEN (Admin API access token com scope read_analytics)
//
// IMPORTANTE: shopifyqlQuery foi removido em 2025-01. Forçamos 2024-07 onde funciona.
// User pode override via env var SHOPIFY_API_VERSION mas o default agora é 2024-07.

import type { Market } from './types';

const STORE_DOMAINS: Record<Market, string> = {
  US: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com',
  BR: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com',
};

const ADMIN_TOKENS: Record<Market, string | undefined> = {
  US: process.env.SHOPIFY_US_ADMIN_API_TOKEN,
  BR: process.env.SHOPIFY_BR_ADMIN_API_TOKEN,
};

// Cassia 2026-06-21: shopifyqlQuery foi REMOVIDO da 2024-07 (probe: "Field 'shopifyqlQuery'
// doesn't exist on type 'QueryRoot'"). Continua funcionando apenas na API `unstable` (confirmado
// via conector Shopify). Por isso o default agora é `unstable` — revive sessões/CVR/funil.
// Override manual via SHOPIFY_API_VERSION_OVERRIDE.
const API_VERSION = process.env.SHOPIFY_API_VERSION_OVERRIDE || 'unstable';

/**
 * Executa query ShopifyQL via Admin GraphQL.
 * Endpoint: /admin/api/2024-07/graphql.json com shopifyqlQuery
 */
export async function runShopifyQL(market: Market, query: string): Promise<{
  rows: Record<string, any>[];
  columns?: { name: string; dataType: string }[];
  raw?: any;
  error?: string;
}> {
  const domain = STORE_DOMAINS[market];
  const token = ADMIN_TOKENS[market];
  if (!token) {
    return { rows: [], error: `SHOPIFY_${market}_ADMIN_API_TOKEN não configurado` };
  }
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const body = {
    query: `query ShopifyQL($q: String!) {
      shopifyqlQuery(query: $q) {
        __typename
        ... on TableResponse {
          tableData {
            rowData
            columns { name dataType }
          }
        }
        ... on ParseError {
          parseErrors { message }
        }
      }
    }`,
    variables: { q: query },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[shopify-admin ${market}] HTTP ${res.status}: ${text.slice(0, 300)}`);
      return { rows: [], error: `HTTP ${res.status}` };
    }
    const json = JSON.parse(text);
    if (json.errors) {
      console.warn(`[shopify-admin ${market}] GraphQL errors:`, JSON.stringify(json.errors).slice(0, 300));
      return { rows: [], error: JSON.stringify(json.errors).slice(0, 200), raw: json };
    }
    const table = json.data?.shopifyqlQuery?.tableData;
    const parseErrors = json.data?.shopifyqlQuery?.parseErrors;
    if (parseErrors && parseErrors.length > 0) {
      const msg = parseErrors.map((e: any) => e.message).join('; ');
      console.warn(`[shopify-admin ${market}] ShopifyQL parse error: ${msg}`);
      return { rows: [], error: msg, raw: json };
    }
    if (!table?.rowData || !table?.columns) {
      return { rows: [], raw: json };
    }
    const rows = table.rowData.map((row: any[]) => {
      const obj: Record<string, any> = {};
      table.columns!.forEach((col: any, i: number) => { obj[col.name] = row[i]; });
      return obj;
    });
    const columns = (table.columns || []).map((c: any) => ({ name: c.name, dataType: c.dataType }));
    return { rows, columns, raw: json };
  } catch (err: any) {
    console.warn(`[shopify-admin ${market}] fetch falhou:`, err?.message);
    return { rows: [], error: err?.message };
  }
}

/**
 * Sessions + CVR diárias.
 */
export async function queryShopifySessions(market: Market, start: string, end: string): Promise<any[]> {
  const query = `
    FROM sessions
    SHOW total_sessions, conversion_rate, total_sales, orders
    SINCE ${start} UNTIL ${end}
    GROUP BY day
  `;
  const { rows } = await runShopifyQL(market, query);
  return rows.map((r) => ({
    date: r.day || r.event_date || r.session_day,
    sessions: Number(r.total_sessions ?? 0),
    conversion_rate: Number(r.conversion_rate ?? 0),
    total_sales: Number(r.total_sales ?? 0),
    orders: Number(r.orders ?? 0),
  }));
}

/**
 * Totais agregados (sessões + CVR).
 * Tenta múltiplas queries (sessions vs online_store_sessions).
 */
export async function queryShopifySessionsTotal(market: Market, start: string, end: string): Promise<{
  sessions: number;
  conversion_rate: number;
  source: string;
  rawResponse?: any;
}> {
  // Tentativa 1: FROM sessions
  let result = await runShopifyQL(market, `
    FROM sessions
    SHOW total_sessions, conversion_rate
    SINCE ${start} UNTIL ${end}
  `);
  if (result.rows.length > 0) {
    const r = result.rows[0];
    const sessions = Number(r.total_sessions ?? 0);
    const cvr = Number(r.conversion_rate ?? 0);
    if (sessions > 0) {
      return { sessions, conversion_rate: cvr, source: 'sessions', rawResponse: result.raw };
    }
  }

  // Tentativa 2: FROM online_store_sessions
  result = await runShopifyQL(market, `
    FROM online_store_sessions
    SHOW total_sessions, conversion_rate
    SINCE ${start} UNTIL ${end}
  `);
  if (result.rows.length > 0) {
    const r = result.rows[0];
    const sessions = Number(r.total_sessions ?? 0);
    const cvr = Number(r.conversion_rate ?? 0);
    if (sessions > 0) {
      return { sessions, conversion_rate: cvr, source: 'online_store_sessions', rawResponse: result.raw };
    }
  }

  // Tentativa 3: FROM sales (tem orders, sessions, cvr no schema 'sales')
  result = await runShopifyQL(market, `
    FROM sales
    SHOW sessions, conversion_rate
    SINCE ${start} UNTIL ${end}
  `);
  if (result.rows.length > 0) {
    const r = result.rows[0];
    const sessions = Number(r.sessions ?? 0);
    const cvr = Number(r.conversion_rate ?? 0);
    if (sessions > 0) {
      return { sessions, conversion_rate: cvr, source: 'sales', rawResponse: result.raw };
    }
  }

  return { sessions: 0, conversion_rate: 0, source: 'none', rawResponse: result.raw };
}

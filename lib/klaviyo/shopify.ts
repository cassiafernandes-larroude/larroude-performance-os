// Cliente Shopify Admin GraphQL. Suporta US e BR.
import type { Market, DateRange } from '@/types/klaviyo/models';

const VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

function getCreds(market: Market): { domain: string; token: string } | null {
  if (market === 'BR') {
    const d = process.env.SHOPIFY_BR_STORE_DOMAIN || '';
    const t = process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '';
    if (d && t) return { domain: d, token: t };
  }
  const d = process.env.SHOPIFY_US_STORE_DOMAIN || '';
  const t = process.env.SHOPIFY_US_ADMIN_API_TOKEN || '';
  if (d && t) return { domain: d, token: t };
  return null;
}

export function isShopifyConfigured(market: Market): boolean {
  return getCreds(market) !== null;
}

export async function shopifyGraphQL<T = any>(market: Market, query: string, variables: Record<string, any> = {}): Promise<T> {
  const creds = getCreds(market);
  if (!creds) throw new Error(`Shopify not configured for market=${market}`);
  const url = `https://${creds.domain}/admin/api/${VERSION}/graphql.json`;
  // Retry com backoff
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': creds.token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.errors) throw new Error(`Shopify GQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
      return json.data as T;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const ra = Number(res.headers.get('retry-after')) || 0;
      await new Promise(r => setTimeout(r, ra > 0 ? ra * 1000 : 1000 * attempt));
      continue;
    }
    const t = await res.text();
    throw new Error(`Shopify ${res.status}: ${t.slice(0, 200)}`);
  }
  throw new Error('Shopify: exceeded retries');
}

interface OrderNode {
  id: string;
  createdAt: string;
  totalPriceSet: { shopMoney: { amount: string } };
  customerJourneySummary?: {
    lastVisit?: { source?: string | null; sourceType?: string | null; utmParameters?: { source?: string | null; medium?: string | null } } | null;
  } | null;
}

// reverse: true → ordenação DESC (mais recentes primeiro) para não perder dias atuais se hit no cap
const ORDERS_QUERY = `
query Orders($q: String!, $cursor: String) {
  orders(first: 250, query: $q, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        createdAt
        totalPriceSet { shopMoney { amount } }
        customerJourneySummary {
          lastVisit {
            source
            sourceType
            utmParameters { source medium }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

function isKlaviyoLastClick(o: OrderNode): boolean {
  const last = o.customerJourneySummary?.lastVisit;
  if (!last) return false;
  const src = String(last.source || '').toLowerCase();
  const utmSrc = String(last.utmParameters?.source || '').toLowerCase();
  const utmMedium = String((last as any).utmParameters?.medium || '').toLowerCase();
  // Match: source ou utm_source contém 'klaviyo' OU sourceType=EMAIL OU utm_medium=email
  // (Klaviyo é o único provedor de email da Larroudé)
  if (src.includes('klaviyo') || utmSrc.includes('klaviyo')) return true;
  if (last.sourceType === 'EMAIL') return true;
  if (utmMedium === 'email') return true;
  return false;
}

// Busca pedidos do período e retorna soma diária de revenue last-click=klaviyo
export async function shopifyLastClickKlaviyoDaily(market: Market, range: DateRange, maxPages = 60): Promise<{ date: string; value: number }[]> {
  const start = range.start.slice(0, 10);
  const end = range.end.slice(0, 10);
  // financial_status:paid removido — pode excluir orders válidas (BR tem orders com status diferente)
  const q = `created_at:>=${start} created_at:<=${end}`;
  const byDay = new Map<string, number>();
  let cursor: string | null = null;
  let page = 0;
  while (page < maxPages) {
    const variables: Record<string, any> = { q };
    if (cursor) variables.cursor = cursor;
    const data: any = await shopifyGraphQL(market, ORDERS_QUERY, variables);
    const edges = data?.orders?.edges || [];
    for (const e of edges) {
      const n: OrderNode = e.node;
      if (!isKlaviyoLastClick(n)) continue;
      const d = n.createdAt.slice(0, 10);
      const amt = Number(n.totalPriceSet?.shopMoney?.amount || 0);
      byDay.set(d, (byDay.get(d) || 0) + amt);
    }
    const pi = data?.orders?.pageInfo;
    page++;
    if (!pi?.hasNextPage) break;
    cursor = pi.endCursor || null;
    if (!cursor) break;
  }

  // Preenche dias zerados
  const out: { date: string; value: number }[] = [];
  const cur = new Date(start + 'T00:00:00Z');
  const stop = new Date(end + 'T00:00:00Z');
  while (cur <= stop) {
    const d = cur.toISOString().slice(0, 10);
    out.push({ date: d, value: byDay.get(d) || 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

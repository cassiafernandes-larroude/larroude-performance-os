// Cassia 2026-06-30: aba Sessões — dados via ShopifyQL `sessions` (Shopify Analytics, API unstable),
// mesma fonte do Funil. ShopifyQL NÃO expõe device/país/região nesse dataset; dimensões válidas:
// landing_page_path, referrer_source, referrer_name, utm_source/campaign + métricas de funil.
// Coleções e "tipo de página" são derivados do landing_page_path.
import { runShopifyQL } from '@/lib/main-dashboard/shopify-admin';

export type Market = 'US' | 'BR';
export type Gran = 'day' | 'week' | 'month';

const COLS = 'sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, bounce_rate';
const METRIC_KEYS = new Set(['sessions', 'sessions_with_cart_additions', 'sessions_that_reached_checkout', 'sessions_that_completed_checkout', 'bounce_rate']);

const n = (v: any) => Number(v) || 0;

export interface SessionMetrics {
  sessions: number; cart: number; checkout: number; completed: number;
  bounceRate: number; cartRate: number; checkoutRate: number; convRate: number;
}
function pack(r: any): SessionMetrics {
  const sessions = n(r.sessions), cart = n(r.sessions_with_cart_additions);
  const checkout = n(r.sessions_that_reached_checkout), completed = n(r.sessions_that_completed_checkout);
  return {
    sessions, cart, checkout, completed,
    bounceRate: n(r.bounce_rate) * 100, // ShopifyQL devolve fração 0-1
    cartRate: sessions ? (cart / sessions) * 100 : 0,
    checkoutRate: sessions ? (checkout / sessions) * 100 : 0,
    convRate: sessions ? (completed / sessions) * 100 : 0,
  };
}

export async function getSessionTotals(market: Market, since: string, until: string): Promise<SessionMetrics> {
  const { rows, error } = await runShopifyQL(market, `FROM sessions SHOW ${COLS} SINCE ${since} UNTIL ${until}`, 'unstable');
  if (error) throw new Error('ShopifyQL sessions totals: ' + error);
  return pack(rows[0] || {});
}

export interface SeriesPoint { date: string; sessions: number; completed: number; convRate: number; }
export async function getSessionSeries(market: Market, since: string, until: string, gran: Gran): Promise<SeriesPoint[]> {
  const { rows, error } = await runShopifyQL(market, `FROM sessions SHOW ${COLS} GROUP BY ${gran} SINCE ${since} UNTIL ${until}`, 'unstable');
  if (error) throw new Error('ShopifyQL sessions series: ' + error);
  return rows
    .map((r: any) => {
      const dateKey = Object.keys(r).find((k) => !METRIC_KEYS.has(k));
      const date = String(r[dateKey ?? ''] ?? '').slice(0, 10);
      const p = pack(r);
      return { date, sessions: p.sessions, completed: p.completed, convRate: p.convRate };
    })
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// landing_page_path → uma query alimenta top páginas + agrupamento por tipo + por coleção.
export interface PageRow { path: string; sessions: number; cart: number; checkout: number; completed: number; bounceRate: number; }
export async function getLandingPages(market: Market, since: string, until: string): Promise<PageRow[]> {
  const { rows, error } = await runShopifyQL(market, `FROM sessions SHOW ${COLS} GROUP BY landing_page_path SINCE ${since} UNTIL ${until} LIMIT 5000`, 'unstable');
  if (error) throw new Error('ShopifyQL sessions pages: ' + error);
  return rows
    .map((r: any) => {
      const p = pack(r);
      return { path: String(r.landing_page_path || ''), sessions: p.sessions, cart: p.cart, checkout: p.checkout, completed: p.completed, bounceRate: p.bounceRate };
    })
    .filter((r) => r.path);
}

export interface DimRow { key: string; sessions: number; completed: number; convRate: number; }
export async function getSessionsByDimension(market: Market, since: string, until: string, dim: 'referrer_source' | 'referrer_name' | 'utm_source'): Promise<DimRow[]> {
  const { rows, error } = await runShopifyQL(market, `FROM sessions SHOW ${COLS} GROUP BY ${dim} SINCE ${since} UNTIL ${until} LIMIT 200`, 'unstable');
  if (error) throw new Error(`ShopifyQL sessions ${dim}: ` + error);
  return rows
    .map((r: any) => {
      const p = pack(r);
      return { key: r[dim] == null || r[dim] === '' ? '(não definido)' : String(r[dim]), sessions: p.sessions, completed: p.completed, convRate: p.convRate };
    })
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
}

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

// Cassia 2026-06-30: classifica a atribuição de sessão do ShopifyQL (utm_source/medium + referrer)
// nos canais do negócio (mesma taxonomia do spend). attentive/shopmy só US; agent.shop só BR.
// Valores reais descobertos por probe (2026-06-30): meta=meta/ig/facebook/Instagram_*/an/threads;
// google ads=utm_source google; klaviyo=Klaviyo ou medium email/flow; awin=awin/medium affiliate.
export type SessionChannel = 'meta' | 'google ads' | 'orgânico' | 'klaviyo' | 'direto' | 'attentive' | 'criteo' | 'shopmy' | 'awin' | 'agent.shop' | 'outros';

export function classifySessionChannel(usRaw: any, umRaw: any, rsRaw: any, market: Market): SessionChannel {
  const us = String(usRaw ?? '').toLowerCase().trim();
  const um = String(umRaw ?? '').toLowerCase().trim();
  const rs = String(rsRaw ?? '').toLowerCase().trim();
  if (us === 'klaviyo' || um === 'email' || um === 'flow' || um === 'newsletter') return 'klaviyo';
  if (us.includes('criteo')) return 'criteo';
  if (market === 'BR' && us.includes('agent')) return 'agent.shop';
  if (market === 'US' && us.includes('shopmy')) return 'shopmy';
  if (market === 'US' && (us === 'attentive' || um === 'sms' || um === 'text')) return 'attentive';
  if (us.includes('awin') || um === 'affiliate' || um === 'afilliate') return 'awin';
  if (us.includes('meta') || us.includes('facebook') || us.startsWith('ig') || us.includes('instagram') || us === 'an' || us.includes('threads')) return 'meta';
  if (us === 'google') return 'google ads';
  if (!us) {
    if (rs === 'direct') return 'direto';
    if (rs === 'search' || rs === 'social' || um === 'organic') return 'orgânico';
    return 'outros';
  }
  if (um === 'organic') return 'orgânico';
  return 'outros';
}

const CHANNEL_ORDER: Record<Market, SessionChannel[]> = {
  US: ['meta', 'google ads', 'orgânico', 'klaviyo', 'direto', 'attentive', 'criteo', 'shopmy', 'awin'],
  BR: ['meta', 'google ads', 'orgânico', 'klaviyo', 'direto', 'criteo', 'awin', 'agent.shop'],
};

export interface ChannelShareRow { channel: SessionChannel; sessions: number; share: number; convRate: number; }
export async function getSessionChannelShare(market: Market, since: string, until: string): Promise<{ total: number; channels: ChannelShareRow[] }> {
  const { rows, error } = await runShopifyQL(market, `FROM sessions SHOW ${COLS} GROUP BY utm_source, utm_medium, referrer_source SINCE ${since} UNTIL ${until} LIMIT 5000`, 'unstable');
  if (error) throw new Error('ShopifyQL sessions channel share: ' + error);
  const agg = new Map<SessionChannel, { sessions: number; completed: number }>();
  let total = 0;
  for (const r of rows) {
    const m = pack(r);
    const ch = classifySessionChannel((r as any).utm_source, (r as any).utm_medium, (r as any).referrer_source, market);
    const e = agg.get(ch) || { sessions: 0, completed: 0 };
    e.sessions += m.sessions; e.completed += m.completed; agg.set(ch, e);
    total += m.sessions;
  }
  const mk = (ch: SessionChannel): ChannelShareRow => {
    const e = agg.get(ch) || { sessions: 0, completed: 0 };
    return { channel: ch, sessions: e.sessions, share: total ? (e.sessions / total) * 100 : 0, convRate: e.sessions ? (e.completed / e.sessions) * 100 : 0 };
  };
  const channels = CHANNEL_ORDER[market].map(mk);
  if (agg.get('outros')) channels.push(mk('outros'));
  return { total, channels };
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

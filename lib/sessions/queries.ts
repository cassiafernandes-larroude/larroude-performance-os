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

// Cassia 2026-06-30: classifica a atribuição de sessão do ShopifyQL nos canais do negócio, seguindo
// AS MESMAS REGRAS da aba Channel Share (lib/shared/channel-utms.ts CHANNEL_UTM_PATTERNS +
// channel-consolidation.ts). Pontos-chave: Meta = utm_source meta-ish COM mídia paga (ou token de
// paid explícito); instagram/facebook SEM mídia paga = Orgânico (social). Orgânico Search + Social
// consolidados em "Orgânico". attentive/shopmy só US; agent.shop só BR. Rótulos = labels canônicos.
export type SessionChannel =
  | 'Meta Ads' | 'Google Ads' | 'Orgânico' | 'Klaviyo Email' | 'Direto'
  | 'SMS Attentive' | 'Criteo' | 'ShopMy' | 'Awin Affiliate' | 'Agent.shop' | 'Outros';

export function classifySessionChannel(usRaw: any, umRaw: any, rsRaw: any, market: Market): SessionChannel {
  const us = String(usRaw ?? '').toLowerCase().trim();
  const um = String(umRaw ?? '').toLowerCase().trim();
  const rs = String(rsRaw ?? '').toLowerCase().trim();
  const paidMedium = /(^|[_\s-])(paid|cpc|cpm|display|social_paid|paidsocial|paid_social)/.test(um);
  // Afiliados / owned (utm_source exato — CHANNEL_UTM_PATTERNS)
  if (us === 'awin') return 'Awin Affiliate';
  if (market === 'US' && us === 'shopmy') return 'ShopMy';
  if (market === 'BR' && us.includes('agent-shop')) return 'Agent.shop';
  if (us === 'klaviyo' || um === 'flow' || um === 'email') return 'Klaviyo Email';
  if (market === 'US' && (us === 'attentive' || um === 'sms' || um === 'text')) return 'SMS Attentive';
  if (us.includes('criteo')) return 'Criteo';
  // Meta: tokens fortes de paid OU source meta-ish + mídia paga
  const metaStrong = us === 'an' || /(^|[_\-])(meta|fb_ads|ig_ads|ig_paid|instagram_paid|fb_paid)/.test(us);
  const metaSource = /(meta|facebook|instagram|^ig|^fb[_\-]?|[_\-](ig|fb))/.test(us);
  if (metaStrong || (metaSource && paidMedium)) return 'Meta Ads';
  // Google Ads: source google + mídia paga (orgânico google = sem utm + referrer search)
  if (us === 'google' && paidMedium) return 'Google Ads';
  // Orgânico (consolidado Search + Social)
  if (um === 'organic') return 'Orgânico';
  if (!us) {
    if (rs === 'direct') return 'Direto';
    if (rs === 'search' || rs === 'social') return 'Orgânico';
    return 'Outros';
  }
  if (metaSource && !paidMedium) return 'Orgânico'; // instagram/facebook orgânico (social)
  if (us === 'google') return 'Orgânico';            // google sem mídia paga
  return 'Outros';
}

const CHANNEL_ORDER: Record<Market, SessionChannel[]> = {
  US: ['Meta Ads', 'Google Ads', 'Orgânico', 'Klaviyo Email', 'Direto', 'SMS Attentive', 'Criteo', 'ShopMy', 'Awin Affiliate'],
  BR: ['Meta Ads', 'Google Ads', 'Orgânico', 'Klaviyo Email', 'Direto', 'Criteo', 'Awin Affiliate', 'Agent.shop'],
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
  if (agg.get('Outros')) channels.push(mk('Outros'));
  return { total, channels };
}

// Cassia 2026-06-30: cross-tab página × canal numa query (GROUP BY landing_page_path + utm/referrer).
// Alimenta: tabela "Sessões por página" com share por canal POR página + o share GERAL por canal +
// derivação de byType/byCollection. ~34k linhas no período de 28d (LIMIT 50000 pega tudo).
export interface PageChannelRow {
  path: string; sessions: number; cart: number; checkout: number; completed: number;
  convRate: number; bounceRate: number; channels: Record<string, number>;
}
export async function getPagesWithChannels(market: Market, since: string, until: string): Promise<{
  order: SessionChannel[]; pages: PageChannelRow[]; overall: { total: number; channels: ChannelShareRow[] };
}> {
  const { rows, error } = await runShopifyQL(market, `FROM sessions SHOW ${COLS} GROUP BY landing_page_path, utm_source, utm_medium, referrer_source SINCE ${since} UNTIL ${until} LIMIT 50000`, 'unstable');
  if (error) throw new Error('ShopifyQL sessions page×channel: ' + error);
  interface Acc { sessions: number; cart: number; checkout: number; completed: number; bouncedW: number; ch: Map<string, number>; }
  const pages = new Map<string, Acc>();
  const overall = new Map<SessionChannel, { sessions: number; completed: number }>();
  let grand = 0;
  for (const r of rows) {
    const path = String((r as any).landing_page_path || ''); if (!path) continue;
    const m = pack(r);
    const ch = classifySessionChannel((r as any).utm_source, (r as any).utm_medium, (r as any).referrer_source, market);
    let e = pages.get(path);
    if (!e) { e = { sessions: 0, cart: 0, checkout: 0, completed: 0, bouncedW: 0, ch: new Map() }; pages.set(path, e); }
    e.sessions += m.sessions; e.cart += m.cart; e.checkout += m.checkout; e.completed += m.completed;
    e.bouncedW += (m.bounceRate / 100) * m.sessions;
    e.ch.set(ch, (e.ch.get(ch) || 0) + m.sessions);
    const o = overall.get(ch) || { sessions: 0, completed: 0 };
    o.sessions += m.sessions; o.completed += m.completed; overall.set(ch, o);
    grand += m.sessions;
  }
  const pageRows: PageChannelRow[] = [...pages.entries()].map(([path, e]) => ({
    path, sessions: e.sessions, cart: e.cart, checkout: e.checkout, completed: e.completed,
    convRate: e.sessions ? (e.completed / e.sessions) * 100 : 0,
    bounceRate: e.sessions ? (e.bouncedW / e.sessions) * 100 : 0,
    channels: Object.fromEntries([...e.ch.entries()]),
  })).sort((a, b) => b.sessions - a.sessions);
  const mk = (c: SessionChannel): ChannelShareRow => {
    const o = overall.get(c) || { sessions: 0, completed: 0 };
    return { channel: c, sessions: o.sessions, share: grand ? (o.sessions / grand) * 100 : 0, convRate: o.sessions ? (o.completed / o.sessions) * 100 : 0 };
  };
  const chans = CHANNEL_ORDER[market].map(mk);
  if (overall.get('Outros')) chans.push(mk('Outros'));
  return { order: CHANNEL_ORDER[market], pages: pageRows, overall: { total: grand, channels: chans } };
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

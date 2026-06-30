// Cassia 2026-06-30: API da aba Sessões. Fonte ShopifyQL `sessions`. Agrega landing_page_path em
// top páginas + por tipo (Home/Produtos/Coleções/Outras) + por coleção. Canais via referrer_source,
// referrer_name e utm_source.
import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionTotals, getSessionSeries, getPagesWithChannels,
  type Market, type Gran, type PageChannelRow,
} from '@/lib/sessions/queries';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, dateRangeCompleted, granularityForDays, daysBetween } from '@/lib/utils/periods';
import type { Period } from '@/types/metric';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

const VALID: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];
function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

function resolveRange(sp: URLSearchParams): { start: string; end: string; gran: Gran } {
  const cs = sp.get('start'), ce = sp.get('end');
  if (cs && ce && /^\d{4}-\d{2}-\d{2}$/.test(cs) && /^\d{4}-\d{2}-\d{2}$/.test(ce)) {
    return { start: cs, end: ce, gran: granularityForDays(daysBetween(cs, ce)) as Gran };
  }
  const pp = sp.get('period') as Period | null;
  const period: Period = pp && VALID.includes(pp) ? pp : '28d';
  const r = (period === '3M' || period === '6M' || period === '12M') ? dateRangeForPeriod(period) : dateRangeCompleted(period);
  const gran: Gran = period === '3M' ? 'week' : (period === '6M' || period === '12M') ? 'month' : 'day';
  return { start: r.from, end: r.to, gran };
}

interface Agg { key: string; sessions: number; cart: number; checkout: number; completed: number; bouncedW: number }
function aggregate(rows: PageChannelRow[], keyFn: (p: PageChannelRow) => string | null) {
  const m = new Map<string, Agg>();
  for (const p of rows) {
    const k = keyFn(p);
    if (k == null) continue;
    let e = m.get(k);
    if (!e) { e = { key: k, sessions: 0, cart: 0, checkout: 0, completed: 0, bouncedW: 0 }; m.set(k, e); }
    e.sessions += p.sessions; e.cart += p.cart; e.checkout += p.checkout; e.completed += p.completed;
    e.bouncedW += (p.bounceRate / 100) * p.sessions; // bounced sessions p/ média ponderada
  }
  return [...m.values()].map((e) => ({
    key: e.key, sessions: e.sessions, cart: e.cart, checkout: e.checkout, completed: e.completed,
    bounceRate: e.sessions ? (e.bouncedW / e.sessions) * 100 : 0,
    cartRate: e.sessions ? (e.cart / e.sessions) * 100 : 0,
    checkoutRate: e.sessions ? (e.checkout / e.sessions) * 100 : 0,
    convRate: e.sessions ? (e.completed / e.sessions) * 100 : 0,
  })).sort((a, b) => b.sessions - a.sessions);
}

// Agrega páginas por coleção MANTENDO o breakdown por canal (mesmas colunas da tabela de páginas).
function aggregateCollections(rows: PageChannelRow[]): PageChannelRow[] {
  interface CAcc { sessions: number; cart: number; checkout: number; completed: number; bouncedW: number; ch: Map<string, number>; name?: string }
  const m = new Map<string, CAcc>();
  for (const p of rows) {
    const h = collectionHandle(p.path); if (!h) continue;
    let e = m.get(h);
    if (!e) { e = { sessions: 0, cart: 0, checkout: 0, completed: 0, bouncedW: 0, ch: new Map() }; m.set(h, e); }
    e.sessions += p.sessions; e.cart += p.cart; e.checkout += p.checkout; e.completed += p.completed;
    e.bouncedW += (p.bounceRate / 100) * p.sessions;
    for (const [c, s] of Object.entries(p.channels)) e.ch.set(c, (e.ch.get(c) || 0) + s);
    if (!e.name && p.name) e.name = p.name;
  }
  return [...m.entries()].map(([h, e]) => ({
    path: `/collections/${h}`, name: e.name, sessions: e.sessions, cart: e.cart, checkout: e.checkout, completed: e.completed,
    convRate: e.sessions ? (e.completed / e.sessions) * 100 : 0,
    bounceRate: e.sessions ? (e.bouncedW / e.sessions) * 100 : 0,
    channels: Object.fromEntries([...e.ch.entries()]),
  })).sort((a, b) => b.sessions - a.sessions).slice(0, 100);
}

function pageType(path: string): string {
  if (path === '/') return 'Home';
  if (path.startsWith('/products/')) return 'Produtos';
  if (path.startsWith('/collections/')) return 'Coleções';
  if (path.startsWith('/pages/')) return 'Páginas institucionais';
  if (path.startsWith('/blogs/')) return 'Blog';
  return 'Outras';
}
function collectionHandle(path: string): string | null {
  if (!path.startsWith('/collections/')) return null;
  const h = path.slice('/collections/'.length).split(/[/?#]/)[0];
  return h || null;
}

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  const { start, end, gran } = resolveRange(req.nextUrl.searchParams);

  try {
    const data = await memo(`sessions:${market}:${start}:${end}:${gran}:v3`, TTL_30M, async () => {
      const [totals, series, pc] = await Promise.all([
        getSessionTotals(market, start, end),
        getSessionSeries(market, start, end, gran),
        getPagesWithChannels(market, start, end),
      ]);

      const byType = aggregate(pc.pages, (p) => pageType(p.path));
      const byCollection = aggregateCollections(pc.pages); // mesmas colunas das páginas (com share por canal)

      // allPages já vem ordenado por sessões, COM o share por canal de cada página.
      return { market, start, end, gran, totals, series, byType, byCollection, allPages: pc.pages, channelOrder: pc.order, channelShare: pc.overall };
    });

    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/sessions]', market, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

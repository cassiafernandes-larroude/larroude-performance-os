// Cassia 2026-06-21: PROBE temporário — descobre quais métricas de funil o ShopifyQL expõe
// de verdade (sessions dataset), pra construir a aba Funil sem inventar etapa.
// GET /api/funnel/probe?market=US  → roda queries-candidatas e reporta colunas/erros.
import { NextRequest, NextResponse } from 'next/server';
import { runShopifyQL } from '@/lib/main-dashboard/shopify-admin';
import type { Market } from '@/lib/main-dashboard/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SINCE = '2026-05-01';
const UNTIL = '2026-06-19';

// Conjuntos de colunas candidatas (nomes possíveis do funil de conversão da loja no ShopifyQL).
const CANDIDATES: { label: string; q: string }[] = [
  { label: 'sessions: base', q: `FROM sessions SHOW total_sessions, conversion_rate, orders, total_sales SINCE ${SINCE} UNTIL ${UNTIL}` },
  { label: 'sessions: funnel A', q: `FROM sessions SHOW total_sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_converted SINCE ${SINCE} UNTIL ${UNTIL}` },
  { label: 'sessions: funnel B', q: `FROM sessions SHOW total_sessions, added_to_cart_sessions, reached_checkout_sessions, converted_sessions SINCE ${SINCE} UNTIL ${UNTIL}` },
  { label: 'sessions: funnel C', q: `FROM sessions SHOW total_sessions, cart_sessions, checkout_sessions, converted_sessions SINCE ${SINCE} UNTIL ${UNTIL}` },
  { label: 'sessions: pageviews', q: `FROM sessions SHOW total_sessions, total_pageviews, pageviews, product_views SINCE ${SINCE} UNTIL ${UNTIL}` },
  { label: 'products: views', q: `FROM products SHOW view_sessions, product_views, sessions SINCE ${SINCE} UNTIL ${UNTIL}` },
  { label: 'sales: payment', q: `FROM sales SHOW net_sales, orders, gross_sales SINCE ${SINCE} UNTIL ${UNTIL}` },
  { label: 'orders: financial', q: `FROM orders SHOW orders, total_sales SINCE ${SINCE} UNTIL ${UNTIL}` },
];

export async function GET(req: NextRequest) {
  const market = (new URL(req.url).searchParams.get('market') || 'US').toUpperCase() as Market;
  const out: any[] = [];
  for (const c of CANDIDATES) {
    const r = await runShopifyQL(market, c.q);
    out.push({
      label: c.label,
      ok: !r.error && (r.columns?.length ?? 0) > 0,
      error: r.error ?? null,
      columns: r.columns?.map((x) => x.name) ?? [],
      sample: r.rows?.[0] ?? null,
    });
  }
  return NextResponse.json({ market, since: SINCE, until: UNTIL, results: out });
}

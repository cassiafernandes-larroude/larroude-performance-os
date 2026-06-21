// Cassia 2026-06-21: Aba Funil — dados DIRETO do Shopify.
// Funil de conversão (sessões → carrinho → checkout → pedido) via ShopifyQL (dataset `sessions`,
// API unstable — única onde shopifyqlQuery ainda existe). Split de pagamento (PIX/cartão/PIX
// pendente) via orders (mirror Shopify no BQ: payment_gateway_names + financial_status).
// Nunca inventa etapa: product-views NÃO é etapa do funil de sessão do Shopify, fica de fora.

import { runShopifyQL } from '@/lib/main-dashboard/shopify-admin';
import { runQuery } from '@/lib/bigquery/client';
import { ORDERS_TABLE } from '@/lib/ltv-dashboard/queries';
import { EXCLUDED_TAGS_REGEX } from '@/lib/shared/dtc-filters';

export type Market = 'US' | 'BR';
export type Granularity = 'day' | 'week' | 'month';

export interface FunnelPoint {
  date: string;
  sessions: number;
  addToCart: number;
  reachedCheckout: number;
  completed: number;
}
export interface FunnelTotals {
  sessions: number;
  addToCart: number;
  reachedCheckout: number;
  completed: number;
}
export interface PaymentPoint {
  date: string;
  pixPaid: number;
  cardPaid: number;
  pixPending: number;
  otherPaid: number;
}
export interface PaymentTotals {
  pixPaid: number;
  cardPaid: number;
  pixPending: number;
  otherPaid: number;
}

const TZ: Record<Market, string> = { US: 'America/New_York', BR: 'America/Sao_Paulo' };

const FUNNEL_COLS = 'sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout';

function mapFunnelRow(r: Record<string, any>, dateKey: string): FunnelPoint {
  return {
    date: r[dateKey] ? String(r[dateKey]).slice(0, 10) : '',
    sessions: Number(r.sessions) || 0,
    addToCart: Number(r.sessions_with_cart_additions) || 0,
    reachedCheckout: Number(r.sessions_that_reached_checkout) || 0,
    completed: Number(r.sessions_that_completed_checkout) || 0,
  };
}

/** Série do funil por granularidade (ShopifyQL direto do Shopify). */
export async function getFunnelSeries(market: Market, since: string, until: string, gran: Granularity): Promise<FunnelPoint[]> {
  const q = `FROM sessions SHOW ${FUNNEL_COLS} GROUP BY ${gran} SINCE ${since} UNTIL ${until}`;
  const { rows, error } = await runShopifyQL(market, q, 'unstable');
  if (error) throw new Error(`ShopifyQL funnel: ${error}`);
  return rows
    .map((r) => mapFunnelRow(r, gran))
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Totais do funil no período (sem GROUP BY). */
export async function getFunnelTotals(market: Market, since: string, until: string): Promise<FunnelTotals> {
  const q = `FROM sessions SHOW ${FUNNEL_COLS} SINCE ${since} UNTIL ${until}`;
  const { rows, error } = await runShopifyQL(market, q, 'unstable');
  if (error) throw new Error(`ShopifyQL funnel totals: ${error}`);
  const r = rows[0] ?? {};
  return {
    sessions: Number(r.sessions) || 0,
    addToCart: Number(r.sessions_with_cart_additions) || 0,
    reachedCheckout: Number(r.sessions_that_reached_checkout) || 0,
    completed: Number(r.sessions_that_completed_checkout) || 0,
  };
}

// Classificação de pagamento (gateway no orders mirror). PIX/cartão/pendente/outros.
const PIX = `LOWER(JSON_VALUE(payment_gateway_names, '$[0]')) LIKE '%pix%'`;
const CARD = `(LOWER(JSON_VALUE(payment_gateway_names, '$[0]')) LIKE '%creditcard%' OR LOWER(JSON_VALUE(payment_gateway_names, '$[0]')) LIKE '%credit card%' OR LOWER(JSON_VALUE(payment_gateway_names, '$[0]')) LIKE '%shopify_payments%' OR LOWER(JSON_VALUE(payment_gateway_names, '$[0]')) LIKE '%card%')`;

function ordersWhere(market: Market): string {
  return `
    cancelled_at IS NULL AND test = FALSE
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(tags, '')), r'${EXCLUDED_TAGS_REGEX}')
  `;
}

/** Split de pagamento por dia (orders mirror Shopify). PIX pago / cartão / PIX pendente / outros. */
export async function getPaymentSeries(market: Market, since: string, until: string): Promise<{ series: PaymentPoint[]; totals: PaymentTotals }> {
  const table = ORDERS_TABLE[market];
  const tz = TZ[market];
  const sql = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(created_at, '${tz}')) AS date,
      COUNTIF(financial_status = 'paid' AND ${PIX}) AS pix_paid,
      COUNTIF(financial_status = 'paid' AND ${CARD}) AS card_paid,
      COUNTIF(financial_status IN ('pending','authorized')) AS pix_pending,
      COUNTIF(financial_status = 'paid' AND NOT (${PIX}) AND NOT (${CARD})) AS other_paid
    FROM \`${table}\`
    WHERE ${ordersWhere(market)}
      AND DATE(created_at, '${tz}') BETWEEN @since AND @until
    GROUP BY date
    ORDER BY date
  `;
  const rows = await runQuery<any>(sql, { since, until });
  const series: PaymentPoint[] = rows.map((r) => ({
    date: String(r.date),
    pixPaid: Number(r.pix_paid) || 0,
    cardPaid: Number(r.card_paid) || 0,
    pixPending: Number(r.pix_pending) || 0,
    otherPaid: Number(r.other_paid) || 0,
  }));
  const totals = series.reduce<PaymentTotals>((a, p) => ({
    pixPaid: a.pixPaid + p.pixPaid,
    cardPaid: a.cardPaid + p.cardPaid,
    pixPending: a.pixPending + p.pixPending,
    otherPaid: a.otherPaid + p.otherPaid,
  }), { pixPaid: 0, cardPaid: 0, pixPending: 0, otherPaid: 0 });
  return { series, totals };
}

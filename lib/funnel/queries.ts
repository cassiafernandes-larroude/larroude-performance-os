// Cassia 2026-06-21: Aba Funil — dados DIRETO do Shopify.
// Funil de conversão (sessões → carrinho → checkout → pedido) via ShopifyQL (dataset `sessions`,
// API unstable — única onde shopifyqlQuery ainda existe). Split de pagamento (PIX/cartão/PIX
// pendente) via orders (mirror Shopify no BQ: payment_gateway_names + financial_status).
// Nunca inventa etapa: product-views NÃO é etapa do funil de sessão do Shopify, fica de fora.

import { runShopifyQL } from '@/lib/main-dashboard/shopify-admin';
import { runQuery } from '@/lib/ltv-dashboard/bigquery';

export type Market = 'US' | 'BR';
export type Granularity = 'day' | 'week' | 'month';

// Cassia 2026-06-21: tabela de orders local (evita importar o módulo pesado ltv-dashboard/queries
// no bundle da rota). Regex de tags inline (mesmo valor canônico).
const ORDERS_TABLE: Record<Market, string> = {
  US: 'larroude-data-prod.stg_shopify.orders',
  BR: 'larroude-data-prod.stg_shopify_br.orders',
};
const EXCLUDED_TAGS_REGEX = 'b2b|wholesale|marketplace|redo|influencer';

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
export interface CardBrand { brand: string; orders: number; }
export interface PaymentBreakdown {
  cards: CardBrand[];   // por bandeira (Visa/Mastercard/Amex/Elo/Discover…), ambos os mercados
  cardTotal: number;
  pixPaid: number;      // só BR
  pixPending: number;   // só BR
  other: number;        // pago sem bandeira/pix identificado
  hasPix: boolean;      // PIX só existe no BR
}

const TZ: Record<Market, string> = { US: 'America/New_York', BR: 'America/Sao_Paulo' };
// Cassia 2026-06-21: transactions (mirror Shopify) trazem a bandeira em payment_details.credit_card_company.
const TX_TABLE: Record<Market, string> = {
  US: 'larroude-data-prod.stg_shopify.transactions',
  BR: 'larroude-data-prod.stg_shopify_br.transactions',
};

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

/**
 * Pagamento dos pedidos no período (mirror Shopify): cartão POR BANDEIRA (join orders↔transactions,
 * credit_card_company) + PIX (só BR). Refs de tabela montadas por concatenação (backticks fora do
 * template — o SWC do Next quebrava `\`${table}\`` no bundle).
 */
export async function getPaymentBreakdown(market: Market, since: string, until: string): Promise<PaymentBreakdown> {
  const tz = TZ[market];
  const ordRef = '`' + ORDERS_TABLE[market] + '`';
  const txRef = '`' + TX_TABLE[market] + '`';
  const sql = `
    WITH ord AS (
      SELECT id AS order_id, financial_status AS fs,
             LOWER(JSON_VALUE(payment_gateway_names, '$[0]')) AS gw
      FROM ${ordRef}
      WHERE cancelled_at IS NULL AND test = FALSE
        AND NOT REGEXP_CONTAINS(LOWER(IFNULL(tags, '')), r'${EXCLUDED_TAGS_REGEX}')
        AND DATE(created_at, '${tz}') BETWEEN @since AND @until
    ),
    tx AS (
      SELECT order_id, ANY_VALUE(JSON_VALUE(payment_details, '$.credit_card_company')) AS brand
      FROM ${txRef}
      WHERE kind IN ('SALE','CAPTURE') AND status = 'SUCCESS'
        AND JSON_VALUE(payment_details, '$.credit_card_company') IS NOT NULL
      GROUP BY order_id
    )
    SELECT bucket, COUNT(*) AS orders FROM (
      SELECT CASE
        WHEN o.fs IN ('pending','authorized') THEN '__PIX_PENDING__'
        WHEN b.brand IS NOT NULL AND LOWER(b.brand) != 'unknown' THEN b.brand
        WHEN o.gw LIKE '%pix%' THEN '__PIX__'
        WHEN o.fs IN ('paid','partially_paid','refunded','partially_refunded') THEN '__OUTROS__'
        ELSE NULL
      END AS bucket
      FROM ord o LEFT JOIN tx b USING (order_id)
    )
    WHERE bucket IS NOT NULL
    GROUP BY bucket
    ORDER BY orders DESC
  `;
  const rows = await runQuery<any>(sql, { since, until });
  const cards: CardBrand[] = [];
  let pixPaid = 0, pixPending = 0, other = 0;
  for (const r of rows) {
    const b = String(r.bucket); const n = Number(r.orders) || 0;
    if (b === '__PIX_PENDING__') pixPending = n;
    else if (b === '__PIX__') pixPaid = n;
    else if (b === '__OUTROS__') other = n;
    else cards.push({ brand: b, orders: n });
  }
  cards.sort((a, b) => b.orders - a.orders);
  return {
    cards,
    cardTotal: cards.reduce((s, c) => s + c.orders, 0),
    pixPaid, pixPending, other,
    hasPix: market === 'BR',
  };
}

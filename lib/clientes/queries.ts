/**
 * Aba Clientes — visão 360° do cliente (DTC only).
 *
 * Cassia 2026-06-21. Fonte: BigQuery `larroude-data-prod.stg_shopify(_br).orders` — a MESMA
 * tabela e os MESMOS filtros DTC do LTV/CAC/Main (reusa ORDERS_TABLE / COMMON_FILTERS_DTC /
 * NET_SALES_EXPR exportados de @/lib/ltv-dashboard/queries). Cliente = COMPRADOR (deriva de
 * orders agregando por customer.id; exclui guest checkouts). Nunca inventa dado: em falha a
 * rota devolve available:false e a UI avisa.
 *
 * Datas: usa DATE(created_at) (UTC), IGUAL ao motor LTV, para os números baterem com o bloco de
 * KPIs (que reusa getLtvKpiSummary). Identidade (email) é mascarada na borda (route/UI), não aqui.
 */

import { runQuery } from '@/lib/ltv-dashboard/bigquery';
import {
  ORDERS_TABLE,
  COMMON_FILTERS_DTC,
  NET_SALES_EXPR,
  validOrdersCte,
  type Market,
} from '@/lib/ltv-dashboard/queries';
import { CHANNEL_UTM_PATTERNS } from '@/lib/shared/channel-utms';

export type { Market };

/**
 * Origem mídia de um pedido a partir das UTMs do landing_site/referring_site.
 * Usa os patterns CANÔNICOS de @/lib/shared/channel-utms (mesma lógica de classificação de
 * canal do channel-costs). `ls`/`rs` = aliases LOWER(IFNULL(landing_site/referring_site,'')).
 * Precedência: owned/afiliado/criteo → paga (google/meta) → orgânico → direto.
 */
function mediaOriginCaseSQL(): string {
  const P = CHANNEL_UTM_PATTERNS;
  return `CASE
    WHEN REGEXP_CONTAINS(ls, r'${P.klaviyo}') THEN 'Klaviyo'
    WHEN REGEXP_CONTAINS(ls, r'${P.attentive}') THEN 'SMS (Attentive)'
    WHEN REGEXP_CONTAINS(ls, r'${P.awin}') THEN 'Awin'
    WHEN REGEXP_CONTAINS(ls, r'${P.shopmy}') THEN 'ShopMy'
    WHEN REGEXP_CONTAINS(ls, r'${P.agentShop}') THEN 'Agent.shop'
    WHEN REGEXP_CONTAINS(ls, r'${P.criteo}') OR REGEXP_CONTAINS(rs, r'${P.criteo}') THEN 'Criteo'
    WHEN REGEXP_CONTAINS(ls, r'${P.googleAds}') THEN 'Google Ads'
    WHEN REGEXP_CONTAINS(ls, r'${P.meta}') THEN 'Meta Ads'
    WHEN REGEXP_CONTAINS(ls, r'${P.metaWithMedium}') AND REGEXP_CONTAINS(ls, r'${P.metaPaidMediums}') THEN 'Meta Ads'
    WHEN REGEXP_CONTAINS(ls, r'utm_medium=email') THEN 'Email'
    WHEN REGEXP_CONTAINS(ls, r'utm_source=google') OR REGEXP_CONTAINS(rs, r'google') THEN 'Orgânico (Search)'
    WHEN REGEXP_CONTAINS(rs, r'(instagram|facebook|tiktok|pinterest|t\\.co|lnk\\.bio|linktr)') THEN 'Orgânico (Social)'
    WHEN ls = '' AND rs = '' THEN 'Direto / Sem UTM'
    ELSE 'Outros'
  END`;
}

export interface CustomerRow {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;       // bruto — mascarar na borda
  orders: number;
  revenue: number;            // net sales no período
  aov: number;
  firstOrder: string | null;  // primeira compra (lifetime)
  lastOrder: string | null;   // última compra no período
  isReturning: boolean;       // já comprava antes do início do período
}

export interface NewVsReturning {
  newCustomers: number;
  returningCustomers: number;
  newRevenue: number;
  returningRevenue: number;
  newOrders: number;
  returningOrders: number;
}

export interface OpenOrderCustomer {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  openOrders: number;
  openValue: number;
  oldestDays: number;
}

export interface OpenOrdersSummary {
  totalOpenOrders: number;
  totalOpenValue: number;
  customersWithOpen: number;
  currency: string;
  byCustomer: OpenOrderCustomer[];
}

export interface CohortCell {
  cohort: string;     // 'YYYY-MM' (mês da 1ª compra)
  size: number;       // clientes adquiridos no mês
  offsets: number[];  // % retido no offset 0..N (offset 0 = 100)
}

const CURRENCY: Record<Market, string> = { US: 'USD', BR: 'BRL' };

export interface CustomerOrder {
  name: string;            // número do pedido (ex: "#L1024")
  date: string | null;
  value: number;           // net sales do pedido
  mediaOrigin: string;     // canal/origem mídia derivado das UTMs
  fulfillment: string;     // 'fulfilled' | 'partial' | null→'unfulfilled'
  financial: string | null;
}

/**
 * Pedidos de UM cliente (até 200, mais recentes primeiro) com número do pedido + origem mídia.
 * On-demand: chamado quando a linha do cliente é expandida na UI.
 */
export async function getCustomerOrders(market: Market, customerId: string): Promise<CustomerOrder[]> {
  const table = ORDERS_TABLE[market];
  // Cassia 2026-06-21: trocas não aparecem como compra (valid_orders ESCOPADO a este cliente —
  // barato, sem varrer a tabela inteira). Mesma definição do motor LTV: exclui TroquEcommerce/Loop
  // (já no COMMON_FILTERS_DTC) + recompra de mesmo produto+cor (size-swap). Assim a lista bate com
  // o nº de pedidos do cliente.
  const sql = `
    WITH
    refunded AS (
      SELECT id AS order_id,
             CAST(JSON_VALUE(rli, '$.line_item_id') AS INT64) AS line_item_id,
             SUM(CAST(JSON_VALUE(rli, '$.quantity') AS FLOAT64)) AS refunded_qty
      FROM \`${table}\`,
        UNNEST(JSON_QUERY_ARRAY(refunds)) AS r,
        UNNEST(JSON_QUERY_ARRAY(r, '$.refund_line_items')) AS rli
      WHERE cancelled_at IS NULL AND test = FALSE AND JSON_VALUE(customer, '$.id') = @customerId
      GROUP BY order_id, line_item_id
    ),
    raw_li AS (
      SELECT id AS order_id,
             DATE(created_at) AS order_date,
             CAST(JSON_VALUE(li, '$.id') AS INT64) AS line_item_id,
             TRIM(REGEXP_REPLACE(JSON_VALUE(li, '$.title'), r'\\s+', ' ')) AS title_norm,
             CAST(JSON_VALUE(li, '$.quantity') AS FLOAT64) AS qty
      FROM \`${table}\`,
        UNNEST(JSON_QUERY_ARRAY(line_items)) AS li
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND JSON_VALUE(customer, '$.id') = @customerId
    ),
    clean_li AS (
      SELECT r.*, r.qty - IFNULL(rf.refunded_qty, 0) AS net_qty
      FROM raw_li r LEFT JOIN refunded rf USING (order_id, line_item_id)
      WHERE r.qty - IFNULL(rf.refunded_qty, 0) > 0
    ),
    valid_orders AS (
      SELECT order_id FROM (
        SELECT order_id,
          ROW_NUMBER() OVER (PARTITION BY title_norm ORDER BY order_date, order_id, line_item_id) AS rn
        FROM clean_li
      ) WHERE rn = 1
    ),
    o AS (
      SELECT
        name,
        FORMAT_DATE('%Y-%m-%d', DATE(created_at)) AS order_date,
        ${NET_SALES_EXPR} AS net_sales,
        fulfillment_status,
        financial_status,
        LOWER(IFNULL(landing_site, '')) AS ls,
        LOWER(IFNULL(referring_site, '')) AS rs
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND JSON_VALUE(customer, '$.id') = @customerId
        AND id IN (SELECT order_id FROM valid_orders)
    )
    SELECT
      name, order_date, net_sales, fulfillment_status, financial_status,
      ${mediaOriginCaseSQL()} AS media_origin
    FROM o
    ORDER BY order_date DESC
    LIMIT 200
  `;
  const rows = await runQuery<any>(sql, { customerId });
  return rows.map((r) => ({
    name: r.name ? String(r.name) : '—',
    date: r.order_date ? String(r.order_date).slice(0, 10) : null,
    value: Number(r.net_sales) || 0,
    mediaOrigin: r.media_origin ? String(r.media_origin) : 'Outros',
    fulfillment: r.fulfillment_status ? String(r.fulfillment_status) : 'unfulfilled',
    financial: r.financial_status ?? null,
  }));
}

/**
 * Novos vs recorrentes no período. NOVO = primeira compra lifetime cai no período;
 * RECORRENTE = já comprava antes de @start. Conta clientes únicos + receita + pedidos.
 */
export async function getNewVsReturning(market: Market, start: string, end: string): Promise<NewVsReturning> {
  const table = ORDERS_TABLE[market];
  // Cassia 2026-06-21: trocas NÃO contam como compra — usa valid_orders (mesma regra do
  // getLtvKpiSummary/getRetentionStats: exclui TroquEcommerce/Loop + recompra de mesmo produto+cor).
  const sql = `
    WITH
    ${validOrdersCte(table, market)},
    first_order AS (
      SELECT JSON_VALUE(customer, '$.id') AS customer_id, MIN(DATE(created_at)) AS first_dt
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND id IN (SELECT order_id FROM valid_orders)
      GROUP BY customer_id
    ),
    period AS (
      SELECT JSON_VALUE(customer, '$.id') AS customer_id,
             COUNT(*) AS orders,
             SUM(${NET_SALES_EXPR}) AS revenue
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND id IN (SELECT order_id FROM valid_orders)
        AND DATE(created_at) BETWEEN @start AND @end
      GROUP BY customer_id
    )
    SELECT
      COUNTIF(fo.first_dt >= @start) AS new_customers,
      COUNTIF(fo.first_dt <  @start) AS returning_customers,
      SUM(IF(fo.first_dt >= @start, p.revenue, 0)) AS new_revenue,
      SUM(IF(fo.first_dt <  @start, p.revenue, 0)) AS returning_revenue,
      SUM(IF(fo.first_dt >= @start, p.orders, 0)) AS new_orders,
      SUM(IF(fo.first_dt <  @start, p.orders, 0)) AS returning_orders
    FROM period p JOIN first_order fo USING (customer_id)
  `;
  const rows = await runQuery<any>(sql, { start, end });
  const r = rows[0] ?? {};
  return {
    newCustomers: Number(r.new_customers) || 0,
    returningCustomers: Number(r.returning_customers) || 0,
    newRevenue: Number(r.new_revenue) || 0,
    returningRevenue: Number(r.returning_revenue) || 0,
    newOrders: Number(r.new_orders) || 0,
    returningOrders: Number(r.returning_orders) || 0,
  };
}

/**
 * Top compradores + base para a lista pesquisável. Retorna os TOP `limit` por receita no
 * período (default 500). A UI usa os primeiros como "melhores clientes" e busca/ordena
 * client-side sobre o restante. Identidade vem do JSON customer da própria order.
 */
export async function getTopCustomers(market: Market, start: string, end: string, limit = 500): Promise<CustomerRow[]> {
  const table = ORDERS_TABLE[market];
  // Cassia 2026-06-21: trocas NÃO contam (valid_orders) — nº de pedidos, LTV e tipo (novo/recorrente)
  // são genuínos, consistentes com o KPI "% Recorrentes".
  const sql = `
    WITH
    ${validOrdersCte(table, market)},
    first_order AS (
      SELECT JSON_VALUE(customer, '$.id') AS customer_id, MIN(DATE(created_at)) AS first_dt
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND id IN (SELECT order_id FROM valid_orders)
      GROUP BY customer_id
    ),
    period AS (
      SELECT
        JSON_VALUE(customer, '$.id') AS customer_id,
        ANY_VALUE(JSON_VALUE(customer, '$.first_name')) AS first_name,
        ANY_VALUE(JSON_VALUE(customer, '$.last_name'))  AS last_name,
        ANY_VALUE(JSON_VALUE(customer, '$.email'))      AS email,
        COUNT(*) AS orders,
        SUM(${NET_SALES_EXPR}) AS revenue,
        FORMAT_DATE('%Y-%m-%d', MAX(DATE(created_at))) AS last_order
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND id IN (SELECT order_id FROM valid_orders)
        AND DATE(created_at) BETWEEN @start AND @end
      GROUP BY customer_id
    )
    SELECT
      p.customer_id, p.first_name, p.last_name, p.email,
      p.orders, p.revenue, p.last_order,
      FORMAT_DATE('%Y-%m-%d', fo.first_dt) AS first_order,
      (fo.first_dt < @start) AS is_returning
    FROM period p JOIN first_order fo USING (customer_id)
    WHERE p.revenue > 0
    ORDER BY p.revenue DESC
    LIMIT @limit
  `;
  const rows = await runQuery<any>(sql, { start, end, limit });
  return rows.map((r) => {
    const orders = Number(r.orders) || 0;
    const revenue = Number(r.revenue) || 0;
    return {
      customerId: String(r.customer_id),
      firstName: r.first_name ?? null,
      lastName: r.last_name ?? null,
      email: r.email ?? null,
      orders,
      revenue,
      aov: orders > 0 ? revenue / orders : 0,
      firstOrder: r.first_order ? String(r.first_order).slice(0, 10) : null,
      lastOrder: r.last_order ? String(r.last_order).slice(0, 10) : null,
      isReturning: !!r.is_returning,
    } as CustomerRow;
  });
}

/**
 * Pedidos em aberto (não-fulfilled) por cliente — fonte BQ (fresca até hoje), bounded a 365d.
 * "Aberto" = fulfillment_status IS NULL ou 'partial', order DTC válida e não estornada.
 */
export async function getOpenOrders(market: Market, limit = 50): Promise<OpenOrdersSummary> {
  const table = ORDERS_TABLE[market];
  const openWhere = `
    ${COMMON_FILTERS_DTC(market)}
    AND (fulfillment_status IS NULL OR fulfillment_status = 'partial')
    AND financial_status NOT IN ('refunded','voided')
    AND DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
  `;
  const totalsSql = `
    SELECT
      COUNT(*) AS total_open_orders,
      SUM(CAST(total_price AS FLOAT64)) AS total_open_value,
      COUNT(DISTINCT JSON_VALUE(customer, '$.id')) AS customers_with_open
    FROM \`${table}\`
    WHERE ${openWhere}
  `;
  const byCustomerSql = `
    SELECT
      JSON_VALUE(customer, '$.id') AS customer_id,
      ANY_VALUE(JSON_VALUE(customer, '$.first_name')) AS first_name,
      ANY_VALUE(JSON_VALUE(customer, '$.last_name'))  AS last_name,
      ANY_VALUE(JSON_VALUE(customer, '$.email'))      AS email,
      COUNT(*) AS open_orders,
      SUM(CAST(total_price AS FLOAT64)) AS open_value,
      DATE_DIFF(CURRENT_DATE(), MIN(DATE(created_at)), DAY) AS oldest_days
    FROM \`${table}\`
    WHERE ${openWhere}
    GROUP BY customer_id
    ORDER BY open_value DESC
    LIMIT @limit
  `;
  const [totalsRows, byRows] = await Promise.all([
    runQuery<any>(totalsSql, {}),
    runQuery<any>(byCustomerSql, { limit }),
  ]);
  const t = totalsRows[0] ?? {};
  return {
    totalOpenOrders: Number(t.total_open_orders) || 0,
    totalOpenValue: Number(t.total_open_value) || 0,
    customersWithOpen: Number(t.customers_with_open) || 0,
    currency: CURRENCY[market],
    byCustomer: byRows.map((r) => ({
      customerId: String(r.customer_id),
      firstName: r.first_name ?? null,
      lastName: r.last_name ?? null,
      email: r.email ?? null,
      openOrders: Number(r.open_orders) || 0,
      openValue: Number(r.open_value) || 0,
      oldestDays: Number(r.oldest_days) || 0,
    })),
  };
}

/**
 * Cohorts de retenção por safra de aquisição (mês da 1ª compra), últimos 12 meses.
 * offsets[k] = % da safra que comprou de novo no mês k após a aquisição (offset 0 = 100%).
 */
export async function getCohorts(market: Market): Promise<CohortCell[]> {
  const table = ORDERS_TABLE[market];
  // Cassia 2026-06-21: retenção genuína — trocas não contam como "voltar a comprar" (valid_orders).
  const sql = `
    WITH
    ${validOrdersCte(table, market)},
    first_order AS (
      SELECT JSON_VALUE(customer, '$.id') AS customer_id, MIN(DATE(created_at)) AS first_dt
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND id IN (SELECT order_id FROM valid_orders)
      GROUP BY customer_id
    ),
    cohorts AS (
      SELECT customer_id, DATE_TRUNC(first_dt, MONTH) AS cohort_month
      FROM first_order
      WHERE first_dt >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 11 MONTH)
    ),
    activity AS (
      SELECT JSON_VALUE(customer, '$.id') AS customer_id,
             DATE_TRUNC(DATE(created_at), MONTH) AS order_month
      FROM \`${table}\`
      WHERE ${COMMON_FILTERS_DTC(market)}
        AND id IN (SELECT order_id FROM valid_orders)
      GROUP BY customer_id, order_month
    )
    SELECT
      FORMAT_DATE('%Y-%m', c.cohort_month) AS cohort,
      DATE_DIFF(a.order_month, c.cohort_month, MONTH) AS month_offset,
      COUNT(DISTINCT c.customer_id) AS customers
    FROM cohorts c JOIN activity a USING (customer_id)
    WHERE a.order_month >= c.cohort_month
    GROUP BY cohort, month_offset
    ORDER BY cohort, month_offset
  `;
  const rows = await runQuery<any>(sql, {});
  // Monta matriz: por cohort, size = offset 0; offsets[k] = % retido.
  const byCohort = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const cohort = String(r.cohort);
    const off = Number(r.month_offset);
    const cust = Number(r.customers) || 0;
    if (!byCohort.has(cohort)) byCohort.set(cohort, new Map());
    byCohort.get(cohort)!.set(off, cust);
  }
  const out: CohortCell[] = [];
  for (const [cohort, offMap] of Array.from(byCohort.entries()).sort()) {
    const size = offMap.get(0) || 0;
    const maxOff = Math.max(0, ...Array.from(offMap.keys()));
    const offsets: number[] = [];
    for (let k = 0; k <= maxOff; k++) {
      const c = offMap.get(k) || 0;
      offsets.push(size > 0 ? (c / size) * 100 : 0);
    }
    out.push({ cohort, size, offsets });
  }
  return out;
}

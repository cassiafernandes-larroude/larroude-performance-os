/**
 * CAC by Channel — spend + novos clientes + CAC por canal de mídia.
 *
 * Cassia 2026-07-02: NÃO mexer em queries-bq.ts (outro agente) — queries novas
 * do CAC vivem aqui.
 *
 * Fontes:
 *   - Spend Meta/Google: `larroude-data-prod.gold.all_channels_daily` (BQ).
 *     Meta na BQ fica stale quando o token expira → API Meta direta é PRIMARY
 *     (mesma fonte do KPI do CAC), BQ como fallback. Ajuste manual Set/25 incluso.
 *   - Fixed tools (Klaviyo/Attentive/Criteo) + % receita (Awin/ShopMy/Agent.shop):
 *     computeTotalSpend (fonte canônica de TOTAL SPEND — regra Cassia 2026-06-14).
 *   - New customers por canal: primeira compra lifetime (MIN created_at por
 *     customer.id) cai no período, canal classificado pelas UTMs canônicas de
 *     lib/shared/channel-utms.ts (mesma lógica do mediaOriginCaseSQL da aba Clientes).
 */

import { runQuery } from './bigquery';
import type { Market } from './queries';
import { CHANNEL_UTM_PATTERNS } from '@/lib/shared/channel-utms';
import { dtcCoreFilters } from '@/lib/shared/dtc-filters';
import { computeTotalSpend } from '@/lib/channel-costs-bq';
import { getMetaSpendAdjustment } from '@/lib/shared/meta-adjustments';
import { queryMetaAdsDaily } from '@/lib/main-dashboard/meta-ads';

const TZ: Record<Market, string> = {
  US: 'America/New_York',
  BR: 'America/Sao_Paulo',
};

const ORDERS_TABLE: Record<Market, string> = {
  US: 'larroude-data-prod.stg_shopify.orders',
  BR: 'larroude-data-prod.stg_shopify_br.orders',
};

export interface ChannelCacRow {
  channel: string;
  /** Spend no período (moeda do market). null = canal sem custo rastreado (orgânico/direto). */
  spend: number | null;
  newCustomers: number;
  /** spend / newCustomers. null quando não há spend ou não há novos clientes. */
  cac: number | null;
  /** Share de novos clientes do período (0..1). */
  share: number;
}

export interface ChannelCacResult {
  rows: ChannelCacRow[];
  totalNewCustomers: number;
  /** Soma do spend de todos os canais com custo rastreado. */
  totalSpend: number;
  sources: { spend: string; newCustomers: string };
}

/**
 * CASE de classificação de canal a partir das UTMs (landing_site/referring_site).
 * Mesma precedência do mediaOriginCaseSQL (lib/clientes/queries.ts):
 * owned/afiliado/criteo → paga (google/meta) → orgânico → direto.
 * Labels em inglês, alinhados com as chaves de computeTotalSpend().byChannel
 * pra dar match spend ↔ novos clientes.
 */
function channelCaseSQL(): string {
  const P = CHANNEL_UTM_PATTERNS;
  return `CASE
    WHEN REGEXP_CONTAINS(ls, r'${P.klaviyo}') THEN 'Klaviyo'
    WHEN REGEXP_CONTAINS(ls, r'${P.attentive}') THEN 'Attentive'
    WHEN REGEXP_CONTAINS(ls, r'${P.awin}') THEN 'Awin'
    WHEN REGEXP_CONTAINS(ls, r'${P.shopmy}') THEN 'ShopMy'
    WHEN REGEXP_CONTAINS(ls, r'${P.agentShop}') THEN 'Agent.shop'
    WHEN REGEXP_CONTAINS(ls, r'${P.criteo}') OR REGEXP_CONTAINS(rs, r'${P.criteo}') THEN 'Criteo'
    WHEN REGEXP_CONTAINS(ls, r'${P.googleAds}') THEN 'Google Ads'
    WHEN REGEXP_CONTAINS(ls, r'${P.meta}') THEN 'Meta Ads'
    WHEN REGEXP_CONTAINS(ls, r'${P.metaWithMedium}') AND REGEXP_CONTAINS(ls, r'${P.metaPaidMediums}') THEN 'Meta Ads'
    WHEN REGEXP_CONTAINS(ls, r'utm_medium=email') THEN 'Email'
    WHEN REGEXP_CONTAINS(ls, r'utm_source=google') OR REGEXP_CONTAINS(rs, r'google') THEN 'Organic (Search)'
    WHEN REGEXP_CONTAINS(rs, r'(instagram|facebook|tiktok|pinterest|t\\.co|lnk\\.bio|linktr)') THEN 'Organic (Social)'
    WHEN ls = '' AND rs = '' THEN 'Direct / No UTM'
    ELSE 'Others'
  END`;
}

/** Novos clientes por canal: 1ª compra lifetime (DTC) dentro do período. */
async function getNewCustomersByChannel(
  market: Market,
  start: string,
  end: string
): Promise<Map<string, number>> {
  // Cassia 2026-07-02: MIN(created_at) por customer sem filtro de data no CTE base —
  // "novo" é lifetime, não "primeira compra dentro da janela". Mesmos filtros DTC
  // canônicos + financial_status NOT IN ('voided','pending','expired','authorized') do resto do CAC.
  const sql = `
    WITH base AS (
      SELECT
        JSON_VALUE(o.customer, '$.id') AS customer_id,
        o.created_at,
        DATE(o.created_at, '${TZ[market]}') AS d,
        LOWER(IFNULL(o.landing_site, '')) AS ls,
        LOWER(IFNULL(o.referring_site, '')) AS rs
      FROM \`${ORDERS_TABLE[market]}\` o
      WHERE JSON_VALUE(o.customer, '$.id') IS NOT NULL
        AND o.financial_status NOT IN ('voided','pending','expired','authorized')
        ${dtcCoreFilters(market, 'o')}
    ),
    first_purchase AS (
      SELECT d, ls, rs
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS rn
        FROM base
      )
      WHERE rn = 1
    )
    SELECT ${channelCaseSQL()} AS channel, COUNT(*) AS new_customers
    FROM first_purchase
    WHERE d BETWEEN @start AND @end
    GROUP BY channel
  `;
  const rows = await runQuery<{ channel: string; new_customers: number | string }>(sql, {
    start,
    end,
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.channel, Number(r.new_customers) || 0);
  return map;
}

/** Spend Meta + Google do período a partir de gold.all_channels_daily. */
async function getAdsSpendFromBQ(
  market: Market,
  start: string,
  end: string
): Promise<{ meta: number; google: number }> {
  const rows = await runQuery<{ meta: number | string; google: number | string }>(
    `SELECT
       SUM(IF(LOWER(channel) LIKE 'meta%', CAST(spend AS FLOAT64), 0)) AS meta,
       SUM(IF(LOWER(channel) LIKE 'google%', CAST(spend AS FLOAT64), 0)) AS google
     FROM \`larroude-data-prod.gold.all_channels_daily\`
     WHERE LOWER(market) = @m AND date BETWEEN @s AND @e`,
    { m: market.toLowerCase(), s: start, e: end }
  );
  return {
    meta: Number(rows[0]?.meta) || 0,
    google: Number(rows[0]?.google) || 0,
  };
}

export async function getChannelCac(
  market: Market,
  start: string,
  end: string
): Promise<ChannelCacResult> {
  const [newByChannel, bqSpend, apiMetaRows] = await Promise.all([
    getNewCustomersByChannel(market, start, end),
    getAdsSpendFromBQ(market, start, end).catch((err) => {
      console.error('[channel-cac] all_channels_daily spend failed:', err);
      return { meta: 0, google: 0 };
    }),
    // Cassia 2026-07-02: Meta na all_channels_daily fica stale (token expirado) —
    // API direta primary pra bater com o card Total Spend do CAC; BQ fallback.
    queryMetaAdsDaily(market, start, end).catch((err) => {
      console.error('[channel-cac] Meta API direct failed, using BQ:', err);
      return [] as Array<{ spend: number }>;
    }),
  ]);

  const apiMetaSpend = apiMetaRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  let metaSpend = apiMetaSpend > 0 ? apiMetaSpend : bqSpend.meta;
  // Ajuste manual Meta US +$400k Set/2025 (pro-rata) — regra Cassia, aplica em todo spend.
  metaSpend += getMetaSpendAdjustment(market, start, end);
  const googleSpend = bqSpend.google;

  // Fixed tools + % receita (Awin/ShopMy/Agent.shop) — fonte canônica de spend total.
  const spendByChannel = await computeTotalSpend(market, start, end, metaSpend, googleSpend)
    .then((b) => b.byChannel)
    .catch((err) => {
      console.error('[channel-cac] computeTotalSpend failed, using ads-only spend:', err);
      const fallback: Record<string, number> = {};
      if (metaSpend > 0) fallback['Meta Ads'] = metaSpend;
      if (googleSpend > 0) fallback['Google Ads'] = googleSpend;
      return fallback;
    });

  const totalNewCustomers = Array.from(newByChannel.values()).reduce((s, v) => s + v, 0);
  const channels = new Set<string>([...Object.keys(spendByChannel), ...newByChannel.keys()]);

  const rows: ChannelCacRow[] = Array.from(channels).map((channel) => {
    const spend = spendByChannel[channel] ?? null;
    const newCustomers = newByChannel.get(channel) ?? 0;
    return {
      channel,
      spend,
      newCustomers,
      cac: spend != null && spend > 0 && newCustomers > 0 ? spend / newCustomers : null,
      share: totalNewCustomers > 0 ? newCustomers / totalNewCustomers : 0,
    };
  });

  // Spend desc; canais sem spend (orgânico/direto) por último, ordenados por novos clientes.
  rows.sort((a, b) => {
    if (a.spend != null && b.spend != null) return b.spend - a.spend;
    if (a.spend != null) return -1;
    if (b.spend != null) return 1;
    return b.newCustomers - a.newCustomers;
  });

  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);

  return {
    rows,
    totalNewCustomers,
    totalSpend,
    sources: {
      spend:
        apiMetaSpend > 0
          ? 'meta_api_direct + bq_all_channels_daily + channel_costs'
          : 'bq_all_channels_daily + channel_costs',
      newCustomers: 'bq_shopify_first_purchase_utm',
    },
  };
}

// =====================================================================
// Cassia 2026-06-14: REGRA CANÔNICA — spend total único pra TODOS dashboards
// =====================================================================
// Toda métrica de spend/ROAS/CAC/CPO em qualquer dashboard DEVE usar
// `computeTotalSpend()` ou `computeTotalSpendComponents()` para garantir
// que o mesmo conjunto de custos entre no denominador:
//
//   TOTAL SPEND = Meta Ads + Google Ads
//               + Klaviyo + Attentive (US) + Criteo  (fixed tools)
//               + Agent.shop (BR) + Awin (US+BR) + ShopMy (US)  (% receita)
//
// Fixed tools vêm de CHANNEL_COSTS (lib/channel-costs.ts) distribuídos
// linearmente por dia dentro do mês. % revenue tools vêm de queries BQ
// na shopify orders matching UTM/landing_site/referring_site patterns.
// =====================================================================

import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";
import { CHANNEL_COSTS, getFixedToolsCostInRange, monthlyCostForMonth } from "@/lib/channel-costs";
import type { Market } from "@/types/metric";

// Patterns vindos do helper central lib/shared/channel-utms.ts (UTMs reais do Shopify)
import { CHANNEL_UTM_PATTERNS } from "@/lib/shared/channel-utms";
import { EXCLUDED_TAGS_REGEX, excludeExchangesSQL } from "@/lib/shared/dtc-filters";
const PERCENT_REV_PATTERNS: Record<string, string> = {
  "Agent.shop": CHANNEL_UTM_PATTERNS.agentShop,
  "Awin": CHANNEL_UTM_PATTERNS.awin,
  "ShopMy": CHANNEL_UTM_PATTERNS.shopmy,
};

export async function getPercentRevenueCostsFromBQ(
  market: Market,
  start: string,
  end: string,
): Promise<{ byChannel: Record<string, number>; total: number }> {
  const result: Record<string, number> = {};
  if (!hasBigQueryCredentials()) return { byChannel: result, total: 0 };

  // Cassia 2026-07-02: dataset US é stg_shopify (stg_shopify_us NÃO existe — a query US
  // falhava silenciosamente e Awin/ShopMy entravam como $0 no TOTAL SPEND de todos os dashboards).
  const tbl = market === "BR"
    ? "larroude-data-prod.stg_shopify_br.orders"
    : "larroude-data-prod.stg_shopify.orders";
  const tz = market === "BR" ? "America/Sao_Paulo" : "America/New_York";
  const capVal = market === "BR" ? 25000 : 30000;

  const pctEntries = (CHANNEL_COSTS[market] || []).filter((e) => e.percentOfRevenue != null);
  if (pctEntries.length === 0) return { byChannel: result, total: 0 };

  await Promise.all(pctEntries.map(async (entry) => {
    const pattern = PERCENT_REV_PATTERNS[entry.channel];
    if (!pattern) return;
    const sql = `
      SELECT SUM(CAST(total_price AS NUMERIC)) AS rev
      FROM \`${tbl}\`
      WHERE DATE(created_at, '${tz}') BETWEEN @start AND @end
        AND cancelled_at IS NULL
        AND test = FALSE
        AND financial_status NOT IN ('voided','refunded')
        ${market === "BR" ? `AND LOWER(IFNULL(financial_status, '')) NOT IN ('pending', 'expired', 'authorized')` : ""}
        AND (
          JSON_VALUE(customer, '$.tags') IS NULL
          OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(customer, '$.tags')), r'${EXCLUDED_TAGS_REGEX}')
        )
        AND NOT REGEXP_CONTAINS(LOWER(IFNULL(tags, '')), r'${EXCLUDED_TAGS_REGEX}')
        AND CAST(total_price AS NUMERIC) < ${capVal}
        ${excludeExchangesSQL()}
        AND (
          REGEXP_CONTAINS(LOWER(IFNULL(landing_site, '')), r'${pattern}')
          OR REGEXP_CONTAINS(LOWER(IFNULL(referring_site, '')), r'${pattern}')
        )
    `;
    try {
      const rows = await runQuery<{ rev: number | string }>(sql, { start, end });
      const rev = Number(rows[0]?.rev) || 0;
      const cost = Math.max(0, rev * entry.percentOfRevenue!);
      if (cost > 0) result[entry.channel] = cost;
    } catch (e) {
      console.warn(`[channel-costs-bq] % revenue query failed for ${entry.channel} (${market}):`, e);
    }
  }));

  const total = Object.values(result).reduce((s, v) => s + v, 0);
  return { byChannel: result, total };
}

export type TotalSpendBreakdown = {
  meta: number;
  google: number;
  fixedTools: number;
  fixedToolsByChannel: Record<string, number>;
  percentRev: number;
  percentRevByChannel: Record<string, number>;
  total: number;
  byChannel: Record<string, number>; // todos canais (Meta, Google, Klaviyo, Attentive, Criteo, Agent.shop, Awin, ShopMy)
};

// SINGLE SOURCE OF TRUTH para spend total em TODOS dashboards.
// Recebe meta + google já calculados (Meta API direta + Supermetrics Google).
// Adiciona fixed tools + % revenue affiliates.
export async function computeTotalSpend(
  market: Market,
  start: string,
  end: string,
  metaSpend: number,
  googleSpend: number,
): Promise<TotalSpendBreakdown> {
  const fixedTools = getFixedToolsCostInRange(market, start, end);
  const pctRev = await getPercentRevenueCostsFromBQ(market, start, end);

  // breakdown por canal pra cards Cost by Channel
  const fixedToolsByChannel: Record<string, number> = {};
  const sd = new Date(start + "T00:00:00Z");
  const ed = new Date(end + "T00:00:00Z");
  for (const entry of CHANNEL_COSTS[market] || []) {
    if (entry.percentOfRevenue != null) continue;
    const monthlyMap = entry.costsByMonth || {};
    if (!Object.keys(monthlyMap).length) continue;
    let cost = 0;
    let y = sd.getUTCFullYear(), m = sd.getUTCMonth() + 1;
    const endY = ed.getUTCFullYear(), endM = ed.getUTCMonth() + 1;
    while (y < endY || (y === endY && m <= endM)) {
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0));
      const iStart = sd > monthStart ? sd : monthStart;
      const iEnd = ed < monthEnd ? ed : monthEnd;
      if (iStart <= iEnd) {
        const days = Math.round((iEnd.getTime() - iStart.getTime()) / 86400000) + 1;
        cost += (monthlyCostForMonth(monthlyMap, y, m) / monthEnd.getUTCDate()) * days;
      }
      m++; if (m > 12) { m = 1; y++; }
    }
    if (cost > 0) fixedToolsByChannel[entry.channel] = cost;
  }

  const byChannel: Record<string, number> = {
    ...(metaSpend > 0 ? { "Meta Ads": metaSpend } : {}),
    ...(googleSpend > 0 ? { "Google Ads": googleSpend } : {}),
    ...fixedToolsByChannel,
    ...pctRev.byChannel,
  };

  return {
    meta: metaSpend,
    google: googleSpend,
    fixedTools,
    fixedToolsByChannel,
    percentRev: pctRev.total,
    percentRevByChannel: pctRev.byChannel,
    total: metaSpend + googleSpend + fixedTools + pctRev.total,
    byChannel,
  };
}

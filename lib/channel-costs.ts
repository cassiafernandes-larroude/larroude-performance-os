// =====================================================================
// CUSTO POR CANAL (manual / fixo) â Performance OS / Overview
//
// Custos mensais das ferramentas/canais (replicado de lgeral/lib/channel-costs.ts).
// Usado para somar no AMOUNT SPENT do Overview, de modo que ROAS / CAC / CPO
// reflitam o custo total (ads + ferramentas).
//
// Convencoes:
//   - Valores na moeda nativa do mercado (US=USD, BR=BRL).
//   - Chaves "YYYY-MM" (ex: "2026-01").
//   - Distribuicao linear por dia dentro do mes (proporcional aos dias do range).
//   - Agent.shop = 10% da receita atribuida ao canal Agent.shop no BR.
// =====================================================================

import type { Market } from "@/types/metric";

export type ChannelCostMonthly = Record<string, number>;

export type ChannelCostEntry = {
  channel: string;
  category: string;
  color: string;
  costsByMonth?: ChannelCostMonthly;
  percentOfRevenue?: number;       // 0..1 (Agent.shop = 0.10)
  revenueChannelName?: string;
};

export const CHANNEL_COSTS: Record<Market, ChannelCostEntry[]> = {
  US: [
    {
      channel: "Attentive",
      category: "SMS",
      color: "#8B5CF6",
      costsByMonth: {
        "2026-01": 26413.40,
        "2026-02": 15615.34,
        "2026-03": 13926.62,
        "2026-04": 12074.51,
        "2026-05": 13329.97,
      },
    },
    {
      channel: "Criteo",
      category: "Ads",
      color: "#FF6600",
      costsByMonth: {
        "2025-06": 15000.00, "2025-07": 15000.00, "2025-08": 15000.00,
        "2025-09": 15000.00, "2025-10": 15000.00, "2025-11": 15000.00,
        "2025-12": 15000.00, "2026-01": 15000.00, "2026-02": 15000.00,
        "2026-03": 15000.00, "2026-04": 15000.00, "2026-05": 15000.00,
      },
    },
    {
      channel: "Klaviyo",
      category: "Email",
      color: "#FF8B7B",
      costsByMonth: {
        "2025-06": 11323.00, "2025-07": 11323.00, "2025-08": 11323.00,
        "2025-09": 11323.00, "2025-10": 11323.00, "2025-11": 11323.00,
        "2025-12": 11323.00, "2026-01": 11323.00, "2026-02": 11323.00,
        "2026-03": 11323.00, "2026-04": 11323.00, "2026-05": 11323.00,
      },
    },
  ],
  BR: [
    {
      channel: "Criteo",
      category: "Ads",
      color: "#FF6600",
      costsByMonth: {
        "2025-06": 50000.00, "2025-07": 50000.00, "2025-08": 50000.00,
        "2025-09": 50000.00, "2025-10": 50000.00, "2025-11": 50000.00,
        "2025-12": 50000.00, "2026-01": 50000.00, "2026-02": 50000.00,
        "2026-03": 50000.00, "2026-04": 50000.00, "2026-05": 50000.00,
      },
    },
    {
      channel: "Agent.shop",
      category: "Affiliate",
      color: "#06B6D4",
      percentOfRevenue: 0.10,
      revenueChannelName: "Agent.shop",
    },
    {
      channel: "Klaviyo",
      category: "Email",
      color: "#FF8B7B",
      costsByMonth: {
        "2025-06": 13000.00, "2025-07": 13000.00, "2025-08": 13000.00,
        "2025-09": 13000.00, "2025-10": 13000.00, "2025-11": 13000.00,
        "2025-12": 13000.00, "2026-01": 13000.00, "2026-02": 13000.00,
        "2026-03": 13000.00, "2026-04": 13000.00, "2026-05": 13000.00,
      },
    },
  ],
};

/**
 * Soma de custos fixos das ferramentas no periodo [start, end] (YYYY-MM-DD).
 * Distribui linearmente o custo mensal pelos dias do mes.
 * NAO inclui custos % de receita (Agent.shop) â esses precisam de revenue passado a parte.
 */
export function getFixedToolsCostInRange(market: Market, start: string, end: string): number {
  const entries = CHANNEL_COSTS[market] || [];
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  let total = 0;
  for (const entry of entries) {
    if (entry.percentOfRevenue != null) continue; // pulado â calculo separado
    const monthlyMap = entry.costsByMonth || {};
    for (const [yyyymm, monthlyCost] of Object.entries(monthlyMap)) {
      const [y, m] = yyyymm.split("-").map(Number);
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0));
      const totalDaysInMonth = monthEnd.getUTCDate();
      const iStart = startDate > monthStart ? startDate : monthStart;
      const iEnd = endDate < monthEnd ? endDate : monthEnd;
      if (iStart > iEnd) continue;
      const daysInRange = Math.round((iEnd.getTime() - iStart.getTime()) / 86400000) + 1;
      total += (monthlyCost / totalDaysInMonth) * daysInRange;
    }
  }
  return total;
}

/**
 * Custo Agent.shop = 10% da receita atribuida ao canal Agent.shop (BR apenas).
 * Recebe a receita ja consultada â evita query extra dentro deste arquivo.
 */
export function getAgentShopCost(market: Market, agentShopRevenue: number): number {
  if (market !== "BR") return 0;
  const entry = CHANNEL_COSTS.BR.find((e) => e.channel === "Agent.shop");
  if (!entry?.percentOfRevenue) return 0;
  return Math.max(0, agentShopRevenue * entry.percentOfRevenue);
}

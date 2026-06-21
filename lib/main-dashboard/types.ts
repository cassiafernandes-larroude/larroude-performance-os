// Types compartilhados entre server (BigQuery) e client (componentes)

export type Market = 'US' | 'BR';
export type PeriodKey = '1d' | '7d' | '14d' | '28d' | '60d' | '90d' | '3M' | '6M' | '12M';
export type Granularity = 'day' | 'week' | 'month';

export interface PeriodRange {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
  /** dias no intervalo */
  days: number;
  /** período anterior comparável */
  prevStart: string;
  prevEnd: string;
}

export interface KpiValue {
  label: string;
  /** valor já formatado para exibição (ex: "$527K") */
  value: string;
  /** valor numérico bruto */
  raw: number;
  /** variação % vs período anterior (ex: -0.20 para -20%) */
  delta?: number | null;
  /** texto auxiliar (ex: "Spend / Shopify Orders") */
  hint?: string;
  /** tom da borda: padrão | bom | alerta | ruim | accent */
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent';
  /** formato sugerido p/ delta inverso (CPC, CPM, CPO sobem = ruim) */
  invertDelta?: boolean;
}

export interface DailyPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
  /** quando false, a barra é exibida em opacidade reduzida (contexto fora do período selecionado) */
  inPeriod?: boolean;
}

export interface DailySeries {
  key: string;
  label: string;
  unit: 'currency' | 'number' | 'percent' | 'multiple';
  color?: string;
  data: DailyPoint[];
}

export interface FunnelSteps {
  sessions: number;
  addToCart: number;
  checkouts: number;
  purchases: number;
}

export interface ChannelRevenue {
  channel: string;
  revenue: number;
  pct: number;
  color?: string;
}

// Cassia 2026-06-14: custo por canal (tools/platforms) — mesma fonte de CHANNEL_COSTS em lib/channel-costs.ts
export interface ChannelCost {
  channel: string;
  category: string;
  cost: number;
  color: string;
}

export interface CampaignRow {
  campaign: string;
  /** plataforma da campanha — exibida em coluna na tabela */
  platform?: 'Meta' | 'Google';
  spend: number;
  roas: number | null;
  purchases: number | null;
  cpo: number | null;
  atc: number | null;
  lpv: number | null;
  status: 'ATIVO' | 'REVISAR' | 'PAUSAR' | 'ESCALAR' | 'TRÁFEGO' | 'AWARENESS' | 'LEADS' | 'ENGAJAMENTO';
}

export interface TopCampaignRoas {
  campaign: string;
  roas: number;
  /** plataforma da campanha (Meta ou Google) — exibida na tabela TOP 10 */
  platform?: 'Meta' | 'Google';
  spend?: number;
}

export interface DashboardAlert {
  tone: 'good' | 'warn' | 'bad' | 'info';
  title: string;
  body: string;
}

export interface DashboardPayload {
  market: Market;
  currency: 'USD' | 'BRL';
  period: PeriodRange;
  generatedAt: string;        // ISO timestamp
  kpis: KpiValue[];
  funnel: FunnelSteps;
  funnelPrev?: FunnelSteps;
  daily: Record<string, DailyPoint[]>; // chaves: gross_sales, net_sales, order_revenue, returns, discounts, spend, roas_gross, roas_order, roas_net, aov, cpo, cpa, cac, cvr, orders, atc, checkouts, purchases, sessions, sessions_prev, direct_sessions, organic_sessions
  channels: ChannelRevenue[];
  channelCosts: ChannelCost[];
  topCampaigns: TopCampaignRoas[];
  campaigns: CampaignRow[];
  alerts: DashboardAlert[];
  // Cassia 2026-06-20: share por origem em 3 categorias (In Stock / On-Demand / Pre-Order).
  originShare?: {
    totalUnits: number;
    totalRevenue: number;
    inStock: { units: number; revenue: number; orders: number; unitsShare: number; revenueShare: number };
    onDemand: { units: number; revenue: number; orders: number; unitsShare: number; revenueShare: number };
    preOrder: { units: number; revenue: number; orders: number; unitsShare: number; revenueShare: number };
  };
}

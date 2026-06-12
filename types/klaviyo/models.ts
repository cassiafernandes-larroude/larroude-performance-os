// Tipos compartilhados — Larroudé CRM Dashboard
export type Market = 'US' | 'BR';
export type Period = 'L1D' | 'L7D' | 'L28D' | '3M' | '6M' | '12M' | 'CUSTOM';

export interface DateRange { start: string; end: string; }
export interface CustomRange { start: string; end: string; }

export interface KpiBlock {
  label: string;
  value: number | string;
  sub?: string;
  color?: 'pink' | 'orange' | 'purple' | 'teal' | 'blue' | 'gold' | 'green' | 'red';
}

export interface CampaignRow {
  id: string;
  name: string;
  sendDate: string;
  status: string;
  recipients: number;
  delivered: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenue: number;
  bounces: number;
  unsubs: number;
  spamComplaints: number;
  openRate: number;
  clickRate: number;
  rpr: number;
  cvr: number;
  bounceRate: number;
  unsubRate: number;
  type: CampaignType;
  audience?: string;
}

export type CampaignType = 'MARKDOWN' | 'FLASH' | 'PREORDER' | 'FULLPRICE' | 'VIP' | 'OTHER';

export interface FlowRow extends Omit<CampaignRow, 'sendDate' | 'type'> {
  triggerType: string;
  flowType: FlowType;
  category: FlowCategory;
  isLive: boolean;
  isCS: boolean;
}

export type FlowType = 'ABANDONED_CHECKOUT' | 'BROWSE_ABANDON' | 'WELCOME' | 'PRICE_DROP' | 'POST_PURCHASE' | 'WINBACK' | 'BIRTHDAY' | 'OTHER';

// Categorias top-level (sub-abas da Flow tab)
export type FlowCategory =
  | 'WELCOME_TRUST'
  | 'HYGIENE_WINBACK'
  | 'FAMILY_CROSSSELL'
  | 'POST_PURCHASE'
  | 'TRIGGERS'
  | 'LIFECYCLE_OTHER';

export const FLOW_CATEGORIES: { id: FlowCategory; label: string; subtypes: string }[] = [
  { id: 'WELCOME_TRUST',     label: 'Welcome & Trust',        subtypes: 'WELCOME SERIES · PRE-PURCHASE TRUST' },
  { id: 'HYGIENE_WINBACK',   label: 'Higienização & Winback', subtypes: 'SUNSET · WINBACK' },
  { id: 'FAMILY_CROSSSELL',  label: 'Família & Cross-Sell',   subtypes: 'CATEGORY SOCIAL PROOF · NEXT BEST · CROSS-SELL' },
  { id: 'POST_PURCHASE',     label: 'Pós-Compra',             subtypes: 'ORDER FOLLOW UP · 2ND PURCHASE · SEPARATE SHIPMENT' },
  { id: 'TRIGGERS',          label: 'Triggers',               subtypes: 'ABANDONO · PRICE DROP · BACK IN STOCK' },
  { id: 'LIFECYCLE_OTHER',   label: 'Lifecycle & Outros',     subtypes: 'BIRTHDAY · REVIEWS · CREDIT · OPENSEND · RFM' }
];

export interface WeeklyPoint { weekStart: string; value: number; }

export interface BenchmarkRow {
  type: string;
  count: number;
  orPct: number; orBaseline: number; orTarget: number;
  ctrPct: number; ctrBaseline: number; ctrTarget: number;
  rpr: number; rprBaseline: number; rprTarget: number;
  signal: 'SCALE' | 'FIX' | 'STOP' | 'MIXED';
}

export interface ListHealth {
  weekStart: string;
  subscriptions: number;
  unsubscribes: number;
  net: number;
}

export interface SegmentRow {
  id: string;
  name: string;
  recipients: number;
  revenue: number;
  openRate: number;
  clickRate: number;
  rpr: number;
}

export interface DayOfWeekRow {
  dayName: string;
  dayIndex: number;
  campaigns: number;
  avgRevenue: number;
  avgOpenRate: number;
  avgCtr: number;
  avgRpr: number;
}

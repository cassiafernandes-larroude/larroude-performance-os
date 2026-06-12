/**
 * Larroude CRM Klaviyo — tipos compartilhados.
 * Replicado de github.com/larroude/larroude-crm-dashboard (Cassia 2026-06-12).
 */

export type Market = 'US' | 'BR';
export type Period = '1d' | '7d' | '14d' | '28d' | '3M' | '6M' | '12M' | 'custom';

export type DateRange = { start: string; end: string };

export type CampaignRow = {
  id: string;
  name: string;
  sentAt: string;
  type: CampaignType;
  recipients: number;
  delivered: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  bounces: number;
  spamComplaints: number;
  revenue: number;
  orders: number;
  openRate: number;
  clickRate: number;
  unsubRate: number;
  bounceRate: number;
  revenuePerRecipient: number;
};

export type FlowRow = {
  id: string;
  name: string;
  flowType: FlowType;
  category: FlowCategory;
  status: string;
  recipients: number;
  delivered: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  bounces: number;
  revenue: number;
  orders: number;
  openRate: number;
  clickRate: number;
  unsubRate: number;
  bounceRate: number;
  revenuePerRecipient: number;
};

export type SegmentRow = {
  id: string;
  name: string;
  profileCount: number;
  revenue: number; // last-click attributed from campaigns
};

export type DailyPoint = { date: string; value: number };

export type CampaignType =
  | 'MARKDOWN'
  | 'FLASH'
  | 'PREORDER'
  | 'FULLPRICE'
  | 'VIP'
  | 'NEWSLETTER'
  | 'OTHER';

export type FlowType =
  | 'WELCOME'
  | 'ABANDONED_CHECKOUT'
  | 'BROWSE_ABANDON'
  | 'POST_PURCHASE'
  | 'WINBACK'
  | 'BIRTHDAY'
  | 'PRICE_DROP'
  | 'BACK_IN_STOCK'
  | 'SUNSET'
  | 'CROSS_SELL'
  | 'OPENSEND'
  | 'CREDIT_REDEMPTION'
  | 'REVIEW'
  | 'OTHER';

export type FlowCategory =
  | 'WELCOME_TRUST'
  | 'HYGIENE_WINBACK'
  | 'FAMILY_CROSSSELL'
  | 'POST_PURCHASE'
  | 'TRIGGERS'
  | 'LIFECYCLE_OTHER';

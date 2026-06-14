export type Region = 'US' | 'BR';

export type Period =
  | '1d' | '7d' | '14d' | '28d' | '3M' | '6M' | '12M' | 'custom';

export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

export interface MetaAccountConfig {
  id: string;             // act_xxxxxxx
  label: string;          // "Larroudé US"
  region: Region;
  isPreOrder: boolean;
}

export interface Kpi {
  label: string;
  value: number;
  delta?: number;       // percentage (e.g. -12.2 means -12.2%)
  format: 'currency' | 'number' | 'percent' | 'integer' | 'decimal';
  prefix?: string;
  suffix?: string;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
  comparisonValue?: number;
  /** Marks bars within the user-selected window (vs contextual bars around it). */
  isHighlighted?: boolean;
}

export interface DualSeriesPoint {
  date: string;
  spend: number;
  revenue: number;
  /** Marks bars within the user-selected window. */
  isHighlighted?: boolean;
}

export interface ScatterPoint {
  name: string;
  spend: number;
  roas: number;
}

export interface CampaignRow {
  id: string;
  name: string;
  account: string;
  spend: number;
  revenue: number;
  purchases: number;
  roas: number;
  costPerPurchase: number;
}

export interface AdRow extends CampaignRow {
  thumbnail?: string;
  ctr?: number;
  addsToCart?: number;
  campaignName?: string;
  adsetName?: string;
  status?: string;             // ACTIVE | PAUSED | DELETED | ARCHIVED
  effectiveStatus?: string;    // ACTIVE | PAUSED | PENDING_REVIEW | DISAPPROVED | etc
  linkUrl?: string | null;     // destination URL do criativo
}

export interface AgePerformanceRow {
  age: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpm: number;
  cpc: number;
  ctr: number;
  websiteConversions: number;
  websiteConversionValue: number;
}

export interface RegionRow {
  region: string;
  countryCode?: string;
  spend: number;
}

export interface FunnelStep {
  label: string;
  value: number;
}

export interface DashboardData {
  region: Region;
  period: Period;
  dateRange: DateRange;
  comparisonRange: DateRange;
  lastUpdated: string;

  kpis: {
    spend: Kpi;
    revenue: Kpi;
    roas: Kpi;
    convRate: Kpi;
    clicks: Kpi;
    cpc: Kpi;
  };

  funnel: {
    landingPageViews: number;
    addsToCart: number;
    checkoutsInitiated: number;
    purchases: number;
  };

  purchasesByGender: { gender: string; value: number }[];

  series: {
    roas: TimeSeriesPoint[];                  // ROAS rolling 28d
    spendVsRevenue: DualSeriesPoint[];        // Amount spent & Purchases value
    clicks: TimeSeriesPoint[];                // Clicks with comparison
    ctr: TimeSeriesPoint[];                   // CTR with comparison
    cpc: TimeSeriesPoint[];                   // CPC with comparison
    impressions: TimeSeriesPoint[];           // Impressions with comparison
    reachFrequency: { date: string; reach: number; frequency: number; isHighlighted?: boolean }[];
    spendByDay: TimeSeriesPoint[];            // Amount spent rolling 28d
    roasMonthly: { month: string; roas: number }[]; // ROAS Sep25-May26
  };

  scatter: ScatterPoint[];                    // Amount spent x ROAS
  topCampaignsByObjective: { objective: string; spend: number }[];
  topCampaigns7d: { name: string; spend: number }[];
  highCpcCampaigns7d: { name: string; cpc: number }[];
  topAds7d: { name: string; purchases: number }[];
  ageGroupSpend: { age: string; female: number; male: number }[];
  agePerformance: AgePerformanceRow[];
  regionsBySpend: RegionRow[];

  campaigns: CampaignRow[];
  ads: AdRow[];
}

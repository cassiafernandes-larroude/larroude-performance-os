export type Market = "US" | "BR";
export type Currency = "USD" | "BRL" | null;
export type Period = "today" | "7d" | "14d" | "28d" | "3M" | "6M" | "12M";

export type MetricSource = "BQ" | "Meta" | "Klaviyo" | "Shopify" | "Google" | "Mock";

export type Metric = {
  key: string;
  label: string;
  value: number;
  formatted: string;
  currency: Currency;
  delta_pct: number | null;
  delta_label: string | null;
  period: { from: string; to: string };
  market: Market;
  source: MetricSource;
  fresh_until: string;
  hint?: string;
};

export type MetricBundle = {
  market: Market;
  period: Period;
  date_range: { from: string; to: string };
  metrics: Metric[];
  generated_at: string;
};

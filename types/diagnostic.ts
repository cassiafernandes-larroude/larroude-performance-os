export type DiagnosticSeverity = "critical" | "warning" | "positive" | "info";

export type DiagnosticCategory =
  | "CAC" | "CRM" | "Pre-Order" | "Funnel"
  | "Site" | "Creative" | "Audience" | "Channel";

export type Diagnostic = {
  id: string;
  created_at: string;
  market: "US" | "BR" | "BOTH";
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  title: string;
  body: string;
  sources: string[];
  metrics: Record<string, number | string>;
  recommendation: string;
  rule_id: string;
};

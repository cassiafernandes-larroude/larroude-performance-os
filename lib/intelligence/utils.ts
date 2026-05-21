import type { Metric, MetricBundle } from "@/types/metric";
import type { Diagnostic, DiagnosticSeverity, DiagnosticCategory } from "@/types/diagnostic";

export function getMetric(bundle: MetricBundle, key: string): Metric | undefined {
  return bundle.metrics.find((m) => m.key === key);
}

export function makeDiagnostic(p: {
  ruleId: string;
  market: "US" | "BR" | "BOTH";
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  title: string;
  body: string;
  sources: string[];
  metrics: Record<string, number | string>;
  recommendation: string;
}): Diagnostic {
  return {
    id: `${p.ruleId}-${p.market}-${Date.now()}`,
    created_at: new Date().toISOString(),
    market: p.market,
    severity: p.severity,
    category: p.category,
    title: p.title,
    body: p.body,
    sources: p.sources,
    metrics: p.metrics,
    recommendation: p.recommendation,
    rule_id: p.ruleId,
  };
}

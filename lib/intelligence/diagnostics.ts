import type { MetricBundle } from "@/types/metric";
import type { Diagnostic } from "@/types/diagnostic";
import { ruleFatigaCriativaMeta } from "./rules/fadiga-criativa-meta";
import { ruleSaturacaoAudiencia } from "./rules/saturacao-audiencia";
import { rulePreOrderDistortion } from "./rules/pre-order-distortion";
import { ruleSitePerformanceBR } from "./rules/site-performance-br";
import { ruleSpendVsResults } from "./rules/spend-vs-results";
import { ruleROASDrop } from "./rules/roas-drop";
import { rulePositiveSignals } from "./rules/positive-signals";

export type DiagnosticContext = {
  us: MetricBundle;
  br: MetricBundle;
};

const RULES = [
  ruleFatigaCriativaMeta,
  ruleSaturacaoAudiencia,
  rulePreOrderDistortion,
  ruleSitePerformanceBR,
  ruleSpendVsResults,
  ruleROASDrop,
  rulePositiveSignals,
];

export async function runDiagnostics(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  const all: Diagnostic[] = [];
  for (const rule of RULES) {
    try {
      const found = await rule(ctx);
      if (found) all.push(...found);
    } catch (err) {
      console.error("rule failed:", err);
    }
  }

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  return all.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function zscore(values: number[], target: number): number {
  if (values.length < 3) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (!std) return 0;
  return (target - mean) / std;
}

export function isAnomaly(values: number[], target: number, threshold = 2): boolean {
  return Math.abs(zscore(values, target)) > threshold;
}

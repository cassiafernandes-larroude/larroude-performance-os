import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { makeDiagnostic } from "../utils";

export async function ruleSitePerformanceBR(_ctx: DiagnosticContext): Promise<Diagnostic[]> {
  // PageSpeed BR conhecido em 37/100 com LCP 23s
  return [makeDiagnostic({
    ruleId: "site-performance-br",
    market: "BR",
    severity: "critical",
    category: "Site",
    title: "Site BR com PageSpeed 37/100 - LCP 23s critico",
    body: "PageSpeed mobile BR esta em 37/100 com LCP de 23s (limite saudavel: 2.5s). Cada 1s de LCP custa em CVR. Provavel impacto direto no checkout funnel.",
    sources: ["Site", "Shopify"],
    metrics: { pagespeed: 37, lcp_s: 23, target_lcp: 2.5 },
    recommendation: "Auditoria Shopify Liquid + lazy load imagens + CDN edge BR",
  })];
}

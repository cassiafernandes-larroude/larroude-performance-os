import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { getMetric, makeDiagnostic } from "../utils";

export async function rulePositiveSignals(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  for (const m of ["US", "BR"] as const) {
    const bundle = m === "US" ? ctx.us : ctx.br;
    const roas = getMetric(bundle, "roas_gross");
    const gross = getMetric(bundle, "gross_sales");
    if (!roas?.delta_pct || !gross?.delta_pct) continue;
    if (roas.delta_pct > 10 && gross.delta_pct > 20) {
      out.push(makeDiagnostic({
        ruleId: "positive-roas-growth",
        market: m,
        severity: "positive",
        category: "Channel",
        title: `${m} - crescimento saudavel: ROAS +${roas.delta_pct.toFixed(1)}% e gross +${gross.delta_pct.toFixed(1)}%`,
        body: `Tanto ROAS quanto receita estao crescendo - eficiencia operacional melhorando. Atual ROAS: ${roas.formatted}.`,
        sources: ["Meta", "Google", "Shopify"],
        metrics: { roas_delta: roas.delta_pct, gross_delta: gross.delta_pct },
        recommendation: "Escalar +20% nas campanhas top performance",
      }));
    }
  }
  return out;
}

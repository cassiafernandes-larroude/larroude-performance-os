import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { getMetric, makeDiagnostic } from "../utils";

export async function ruleSpendVsResults(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  for (const m of ["US", "BR"] as const) {
    const bundle = m === "US" ? ctx.us : ctx.br;
    const spend = getMetric(bundle, "amount_spent");
    const gross = getMetric(bundle, "gross_sales");
    if (!spend?.delta_pct || !gross?.delta_pct) continue;

    if (spend.delta_pct > 50 && gross.delta_pct < spend.delta_pct - 20) {
      out.push(makeDiagnostic({
        ruleId: "spend-vs-results-gap",
        market: m,
        severity: "warning",
        category: "Channel",
        title: `Spend ${m} crescendo mais rapido que gross sales`,
        body: `Spend +${spend.delta_pct.toFixed(1)}% vs gross +${gross.delta_pct.toFixed(1)}%. Gap de ${(spend.delta_pct - gross.delta_pct).toFixed(1)}pp. Investimento marginal nao esta convertendo na mesma taxa.`,
        sources: ["Meta", "Google", "Shopify"],
        metrics: { spend_delta: spend.delta_pct, gross_delta: gross.delta_pct, gap_pp: spend.delta_pct - gross.delta_pct },
        recommendation: "Revisar mix de campanhas - prioritarizar high-ROAS",
      }));
    }
  }
  return out;
}

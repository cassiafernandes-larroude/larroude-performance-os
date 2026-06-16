import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { getMetric, makeDiagnostic } from "../utils";

export async function ruleFatigaCriativaMeta(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  for (const m of ["US", "BR"] as const) {
    const bundle = m === "US" ? ctx.us : ctx.br;
    const cac = getMetric(bundle, "cac");
    const roas = getMetric(bundle, "roas_gross");
    if (!cac?.delta_pct || !roas?.delta_pct) continue;

    if (cac.delta_pct > 15 && roas.delta_pct < -10) {
      out.push(makeDiagnostic({
        ruleId: "fadiga-criativa-meta",
        market: m,
        severity: "critical",
        category: "Creative",
        title: `CAC ${m} +${cac.delta_pct.toFixed(1)}% e ROAS ${roas.delta_pct.toFixed(1)}% - fadiga criativa Meta`,
        body: `CAC subiu ${cac.delta_pct.toFixed(1)}% e ROAS caiu ${roas.delta_pct.toFixed(1)}% no periodo. Sinal classico de fadiga criativa - frequencia alta + CTR caindo.`,
        sources: ["Meta", "BQ"],
        metrics: { cac_delta_pct: cac.delta_pct, roas_delta_pct: roas.delta_pct, cac: cac.formatted },
        recommendation: "Refresh criativo + ampliar audiencia lookalike",
      }));
    }
  }
  return out;
}

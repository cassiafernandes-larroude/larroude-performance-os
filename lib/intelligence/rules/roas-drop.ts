import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { getMetric, makeDiagnostic } from "../utils";

export async function ruleROASDrop(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  for (const m of ["US", "BR"] as const) {
    const bundle = m === "US" ? ctx.us : ctx.br;
    const roas = getMetric(bundle, "roas_gross");
    if (!roas?.delta_pct) continue;
    if (roas.delta_pct < -15) {
      out.push(makeDiagnostic({
        ruleId: "roas-drop",
        market: m,
        severity: "critical",
        category: "Channel",
        title: `ROAS ${m} caiu ${roas.delta_pct.toFixed(1)}% no periodo`,
        body: `ROAS gross caiu ${roas.delta_pct.toFixed(1)}% comparado ao periodo anterior. Atual: ${roas.formatted}. Threshold de alerta foi atingido.`,
        sources: ["Meta", "Google", "BQ"],
        metrics: { roas_delta_pct: roas.delta_pct, roas_current: roas.formatted },
        recommendation: "Pausar campanhas low-ROAS + investigar atribuicao",
      }));
    }
  }
  return out;
}

import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { getMetric, makeDiagnostic } from "../utils";

export async function ruleSaturacaoAudiencia(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  for (const m of ["US", "BR"] as const) {
    const bundle = m === "US" ? ctx.us : ctx.br;
    const spend = getMetric(bundle, "amount_spent");
    const orders = getMetric(bundle, "orders");
    if (!spend?.delta_pct || !orders?.delta_pct) continue;

    if (spend.delta_pct > 30 && orders.delta_pct < 10) {
      out.push(makeDiagnostic({
        ruleId: "saturacao-audiencia",
        market: m,
        severity: "warning",
        category: "Audience",
        title: `Spend ${m} +${spend.delta_pct.toFixed(1)}% mas pedidos so +${orders.delta_pct.toFixed(1)}% - saturacao`,
        body: `Aumentamos spend ${spend.delta_pct.toFixed(1)}% mas orders so cresceram ${orders.delta_pct.toFixed(1)}%. Pool de audiencia possivelmente saturado.`,
        sources: ["Meta", "Google", "Shopify"],
        metrics: { spend_delta: spend.delta_pct, orders_delta: orders.delta_pct },
        recommendation: "Testar audiencias frias ou novos canais",
      }));
    }
  }
  return out;
}

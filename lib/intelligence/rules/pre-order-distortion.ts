import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { makeDiagnostic } from "../utils";

export async function rulePreOrderDistortion(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  // Static rule baseada no contexto Larroude: pre-orders ~58% da receita US
  return [makeDiagnostic({
    ruleId: "pre-order-distortion",
    market: "US",
    severity: "warning",
    category: "Pre-Order",
    title: "Pre-orders distorcem qualidade de novos clientes US",
    body: "Pre-orders representam ~58% da receita US. Conta PRE-ORDER puxa nCAC para baixo. Sem segregar, mascara o real custo de aquisicao core.",
    sources: ["Meta", "Shopify", "BQ"],
    metrics: { share_pct: 58, ncac_core_estimate: "$142", ncac_blended_estimate: "$118" },
    recommendation: "Separar tracking core vs pre-order na camada de relatorios",
  })];
}

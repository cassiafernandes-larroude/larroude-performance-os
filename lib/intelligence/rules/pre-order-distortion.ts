import type { Diagnostic } from "@/types/diagnostic";
import type { DiagnosticContext } from "../diagnostics";
import { makeDiagnostic } from "../utils";

export async function rulePreOrderDistortion(ctx: DiagnosticContext): Promise<Diagnostic[]> {
  // Cassia 2026-06-21: caveat ESTRUTURAL qualitativo (nao quantitativo). Antes esta regra
  // exibia metricas FIXAS inventadas (share 58%, nCAC $142/$118) como se medidas — removidas
  // para nao inventar dado. Quando houver query real de receita pre-order vs core, popular
  // `metrics` com os valores calculados de BQ.
  return [makeDiagnostic({
    ruleId: "pre-order-distortion",
    market: "US",
    severity: "warning",
    category: "Pre-Order",
    title: "Pre-orders distorcem qualidade de novos clientes US",
    body: "A conta PRE-ORDER (pré-lançamentos) puxa o nCAC para baixo. Sem segregar core vs pre-order, o custo real de aquisição do core fica mascarado. Caveat estrutural — sem número medido aqui.",
    sources: ["Meta", "Shopify", "BQ"],
    metrics: {},
    recommendation: "Separar tracking core vs pre-order na camada de relatorios e quantificar o share via BQ",
  })];
}

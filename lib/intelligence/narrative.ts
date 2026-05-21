import Anthropic from "@anthropic-ai/sdk";
import type { MetricBundle } from "@/types/metric";
import type { Diagnostic } from "@/types/diagnostic";

export type Narrative = {
  title: string;
  body: string;
  generated_at: string;
  source: "anthropic" | "fallback";
};

const FALLBACK_NARRATIVE = (us: MetricBundle, br: MetricBundle, diagnostics: Diagnostic[]): Narrative => ({
  title: "Visao consolidada do periodo",
  body: `US gerou ${us.metrics.find(m => m.key === "gross_sales")?.formatted || "—"} em gross sales com ROAS ${us.metrics.find(m => m.key === "roas_gross")?.formatted || "—"}. BR fechou em ${br.metrics.find(m => m.key === "gross_sales")?.formatted || "—"} com ROAS ${br.metrics.find(m => m.key === "roas_gross")?.formatted || "—"}. Diagnostico engine encontrou ${diagnostics.length} insights (${diagnostics.filter(d => d.severity === "critical").length} criticos). Configure ANTHROPIC_API_KEY para narrativa automatica via Claude.`,
  generated_at: new Date().toISOString(),
  source: "fallback",
});

export async function generateNarrative(
  us: MetricBundle,
  br: MetricBundle,
  diagnostics: Diagnostic[]
): Promise<Narrative> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return FALLBACK_NARRATIVE(us, br, diagnostics);

  try {
    const client = new Anthropic({ apiKey });
    const prompt = `Voce e analista senior de performance da Larroude (marca de calcados premium, US + BR).
Escreva uma narrativa curta (3 paragrafos, ato 1/2/3) explicando o estado atual do negocio
em portugues brasileiro direto.

Dados US (${us.period}):
${us.metrics.map(m => `- ${m.label}: ${m.formatted} (delta: ${m.delta_label || "n/a"})`).join("\n")}

Dados BR (${br.period}):
${br.metrics.map(m => `- ${m.label}: ${m.formatted} (delta: ${m.delta_label || "n/a"})`).join("\n")}

Diagnosticos automaticos detectados:
${diagnostics.slice(0, 5).map(d => `- [${d.severity.toUpperCase()}] ${d.title}`).join("\n")}

Regras de escrita:
- Tom direto, sem floreio
- Use os numeros formatados acima (nao reinvente)
- Ato 1: o que aconteceu / contexto numerico
- Ato 2: por que (hipotese explicativa cruzando fontes)
- Ato 3: proxima acao recomendada
- Maximo 250 palavras
- Tambem gere um titulo curto de no maximo 10 palavras

Retorne JSON: {"title": "...", "body": "Ato 1. ... Ato 2. ... Ato 3. ..."}`;

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json in response");
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      title: parsed.title || "Analise do periodo",
      body: parsed.body || text,
      generated_at: new Date().toISOString(),
      source: "anthropic",
    };
  } catch (err) {
    console.error("anthropic narrative failed:", err);
    return FALLBACK_NARRATIVE(us, br, diagnostics);
  }
}

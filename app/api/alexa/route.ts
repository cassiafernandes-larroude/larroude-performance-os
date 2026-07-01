import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { verifyAlexaRequest } from "@/lib/alexa/verify";
import { getMetricBundle } from "@/lib/data/metrics";
import { getAnthropic, hasAnthropicCredentials, MODEL } from "@/lib/anthropic/client";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/anthropic/tools";
import type { Market } from "@/types/metric";

// Cassia 2026-07-01: endpoint de fulfillment da Alexa Custom Skill "Larroude".
// Voz -> Amazon (voz->texto) -> aqui. Caminho rapido: perguntas comuns (faturamento/
// pedidos/spend/CAC de HOJE) respondem em <2s via getMetricBundle direto. Fallback:
// perguntas abertas caem no Claude (mesmas tools do /api/chat). Precisa runtime Node
// (crypto p/ verificar assinatura). Skill privada -> tambem checamos o applicationId.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VOICE_SYSTEM_PROMPT = `Voce e o analista de performance da Larroude respondendo por VOZ (Alexa).
Regras de voz:
- Responda em portugues brasileiro, em NO MAXIMO 2 frases curtas.
- Fale o numero e o contexto (vs periodo anterior) e pare. Nada de listas, markdown ou tabelas.
- Valores em dolares (US) ou reais (BR). Ex: "Faturamento de hoje no US: 42 mil dolares, 12 por cento acima de ontem."
- Se nao houver dado, diga isso em uma frase. Nunca invente numeros.
- Use a tool query_metrics para buscar dados antes de responder.`;

function speak(text: string, endSession = true) {
  return NextResponse.json({
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      shouldEndSession: endSession,
    },
  });
}

// --- caminho rapido: casa a pergunta com uma metrica conhecida ---------------
type FastMetric = { keys: string[]; label: string };
const METRIC_MAP: Record<string, FastMetric> = {
  faturamento: { keys: ["total_sales"], label: "faturamento" },
  vendas: { keys: ["total_sales"], label: "vendas" },
  receita: { keys: ["total_sales"], label: "receita" },
  gross: { keys: ["gross_sales"], label: "gross sales" },
  pedidos: { keys: ["orders"], label: "pedidos" },
  orders: { keys: ["orders"], label: "pedidos" },
  investimento: { keys: ["amount_spent"], label: "investimento em midia" },
  spend: { keys: ["amount_spent"], label: "investimento em midia" },
  cac: { keys: ["cac"], label: "CAC" },
  roas: { keys: ["roas_total"], label: "ROAS" },
  ticket: { keys: ["aov"], label: "ticket medio" },
  aov: { keys: ["aov"], label: "ticket medio" },
  unidades: { keys: ["units"], label: "unidades vendidas" },
};

function detectMarket(q: string): Market | null {
  const s = q.toLowerCase();
  if (/\b(brasil|brazil|br|bra)\b/.test(s)) return "BR";
  if (/\b(us|eua|estados unidos|americ)/.test(s)) return "US";
  return null;
}

function detectMetric(q: string): FastMetric | null {
  const s = q.toLowerCase();
  for (const kw of Object.keys(METRIC_MAP)) {
    if (s.includes(kw)) return METRIC_MAP[kw];
  }
  return null;
}

function speakNumber(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function speakDelta(deltaPct: number | null): string {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return "";
  const dir = deltaPct >= 0 ? "acima" : "abaixo";
  return `, ${Math.abs(Math.round(deltaPct))} por cento ${dir} do periodo anterior`;
}

async function tryFastPath(query: string): Promise<string | null> {
  const market = detectMarket(query);
  const metric = detectMetric(query);
  if (!market || !metric) return null;
  // "hoje" e o caso rapido; outros periodos tambem funcionam via getMetricBundle mas
  // o gatilho principal por voz e o dia corrente.
  const bundle = await getMetricBundle(market, "today");
  const m = bundle.metrics.find((x) => metric.keys.includes(x.key));
  if (!m || m.source === "Unavailable") {
    return `Ainda nao tenho o dado de ${metric.label} de hoje no ${market === "US" ? "US" : "Brasil"}.`;
  }
  const currencyWord = m.currency === "USD" ? " dolares" : m.currency === "BRL" ? " reais" : "";
  const valueStr =
    m.currency ? `${speakNumber(m.value)}${currencyWord}` : speakNumber(m.value);
  const mkt = market === "US" ? "no US" : "no Brasil";
  return `${cap(metric.label)} de hoje ${mkt}: ${valueStr}${speakDelta(m.delta_pct)}.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- fallback: Claude com as mesmas tools do /api/chat -----------------------
async function askClaude(query: string): Promise<string> {
  if (!hasAnthropicCredentials()) return "O assistente ainda nao esta configurado.";
  const client = getAnthropic();
  if (!client) return "Nao consegui iniciar o assistente.";

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: query }];
  let iterations = 0;
  const MAX_ITERATIONS = 3; // voz tem orcamento de tempo curto (Alexa ~8s)

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: VOICE_SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });
    const toolUse = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (toolUse.length === 0) {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => ("text" in b ? b.text : ""))
        .join(" ")
        .trim();
      return text || "Nao consegui responder isso agora.";
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUse) {
      const r = await executeTool(block.name, block.input as Record<string, unknown>);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(r.ok ? r.result : { error: r.error }),
        is_error: !r.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }
  return "A pergunta ficou complexa demais pra responder por voz. Tenta pelo painel.";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1) Verifica assinatura da Amazon.
  const verdict = await verifyAlexaRequest(
    rawBody,
    req.headers.get("signaturecertchainurl"),
    req.headers.get("signature"),
    (() => {
      try {
        return JSON.parse(rawBody)?.request?.timestamp ?? null;
      } catch {
        return null;
      }
    })()
  );
  if (!verdict.ok) {
    return NextResponse.json({ error: `alexa verify: ${verdict.reason}` }, { status: 400 });
  }

  const body = JSON.parse(rawBody);

  // 2) Skill privada: confere o applicationId (evita outra skill batendo no endpoint).
  const expectedSkillId = process.env.ALEXA_SKILL_ID;
  const gotSkillId = body?.context?.System?.application?.applicationId ?? body?.session?.application?.applicationId;
  if (expectedSkillId && gotSkillId !== expectedSkillId) {
    return NextResponse.json({ error: "alexa: applicationId mismatch" }, { status: 403 });
  }

  const type = body?.request?.type;

  if (type === "LaunchRequest") {
    return speak("Oi! Pergunta o faturamento, pedidos ou o CAC de hoje no US ou no Brasil.", false);
  }

  if (type === "SessionEndedRequest") {
    return speak("Ate mais.", true);
  }

  if (type === "IntentRequest") {
    const intent = body.request.intent;
    const name = intent?.name as string;

    if (name === "AMAZON.StopIntent" || name === "AMAZON.CancelIntent") {
      return speak("Ate mais.", true);
    }
    if (name === "AMAZON.HelpIntent") {
      return speak("Voce pode perguntar, por exemplo: qual o faturamento de hoje no US.", false);
    }

    // Slot de texto livre (AMAZON.SearchQuery) chamado "pergunta".
    const query: string =
      intent?.slots?.pergunta?.value ||
      intent?.slots?.query?.value ||
      "";

    if (!query) {
      return speak("Nao entendi a pergunta. Pode repetir?", false);
    }

    try {
      const fast = await tryFastPath(query);
      if (fast) return speak(fast, true);
      const answer = await askClaude(query);
      return speak(answer, true);
    } catch (err) {
      console.error("[alexa] handler failed:", err);
      return speak("Deu um erro ao buscar os dados. Tenta de novo daqui a pouco.", true);
    }
  }

  return speak("Nao entendi esse pedido.", true);
}

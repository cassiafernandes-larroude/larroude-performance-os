import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, hasAnthropicCredentials, MODEL } from "@/lib/anthropic/client";
import { ASK_CLAUDE_SYSTEM_PROMPT } from "@/lib/anthropic/system-prompts";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/anthropic/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  reply: string;
  tool_calls: Array<{ name: string; input: unknown; output: unknown; ok: boolean }>;
  model: string;
  source: "anthropic" | "fallback";
};

export async function POST(req: NextRequest) {
  if (!hasAnthropicCredentials()) {
    return NextResponse.json({
      reply: "Anthropic API ainda nao configurada. Configure ANTHROPIC_API_KEY no Vercel para ativar o chat.",
      tool_calls: [],
      model: MODEL,
      source: "fallback",
    } satisfies ChatResponse);
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "missing messages" }, { status: 400 });
  }

  const client = getAnthropic();
  if (!client) {
    return NextResponse.json({ error: "anthropic not initialized" }, { status: 500 });
  }

  const messages: Anthropic.MessageParam[] = (body.messages as IncomingMessage[]).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: ChatResponse["tool_calls"] = [];
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: ASK_CLAUDE_SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    // se nao tem tool_use, retorna texto final
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (toolUseBlocks.length === 0) {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => ("text" in b ? b.text : ""))
        .join("\n");
      return NextResponse.json({
        reply: text,
        tool_calls: toolCalls,
        model: MODEL,
        source: "anthropic",
      } satisfies ChatResponse);
    }

    // adiciona resposta do assistant ao historico
    messages.push({ role: "assistant", content: response.content });

    // executa todos os tool_use e adiciona como tool_result
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input as Record<string, unknown>);
      toolCalls.push({
        name: block.name,
        input: block.input,
        output: result.result,
        ok: result.ok,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result.ok ? result.result : { error: result.error }),
        is_error: !result.ok,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({
    reply: "Limite de iteracoes de tool use atingido. Tente reformular a pergunta.",
    tool_calls: toolCalls,
    model: MODEL,
    source: "anthropic",
  } satisfies ChatResponse);
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, CornerDownRight, Loader2, Wrench, AlertCircle } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: Array<{ name: string; input: unknown; output: unknown; ok: boolean }>;
  source?: "anthropic" | "fallback";
};

const SUGGESTIONS = [
  "Qual o ROAS gross do US nos ultimos 28 dias?",
  "Compara CAC US vs BR no periodo 28d",
  "Quais sao os diagnosticos criticos agora?",
  "O que e nCAC?",
];

export function AskClaudePanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHasCredentials(d.integrations?.anthropic === "configured"))
      .catch(() => setHasCredentials(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply || "(resposta vazia)",
          tool_calls: data.tool_calls,
          source: data.source,
        },
      ]);
    } catch (err) {
      setMessages([
        ...next,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `Erro ao consultar API: ${String(err)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--pink)" }}>
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>Ask Claude</h1>
            <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>BigQuery - Diagnosticos - Comparacao US vs BR</p>
          </div>
        </div>
        {hasCredentials === false && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--warning)" }}>
            <AlertCircle className="w-3.5 h-3.5" />
            <span>ANTHROPIC_API_KEY ausente</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-area px-3 sm:px-6 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="font-display text-[20px] mb-2" style={{ color: "var(--ink)" }}>Pergunte sobre performance</h2>
              <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
                Tenho acesso a metricas (US + BR), diagnosticos automaticos, comparacao de mercados e glossario de KPIs.
              </p>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider px-1 mb-2" style={{ color: "var(--ink-muted)" }}>
                Sugestoes
              </div>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="chip-suggestion w-full"
                  disabled={loading}
                >
                  <CornerDownRight className="w-3 h-3 flex-shrink-0" style={{ color: "var(--ink-muted)" }} />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {messages.map((m) => (
              <div key={m.id}>
                {m.role === "user" ? (
                  <div className="chat-msg-user ml-auto max-w-[85%] sm:max-w-md">
                    <p className="text-[13px]" style={{ color: "var(--ink)" }}>{m.content}</p>
                  </div>
                ) : (
                  <div>
                    <div className="chat-msg-ai-header flex items-center gap-2">
                      <span>Claude</span>
                      {m.tool_calls && m.tool_calls.length > 0 && (
                        <span className="text-[10px] font-normal normal-case tracking-normal flex items-center gap-1" style={{ color: "var(--ink-muted)" }}>
                          <Wrench className="w-3 h-3" />
                          {m.tool_calls.map((t) => t.name).join(" + ")}
                        </span>
                      )}
                      {m.source === "fallback" && (
                        <span className="text-[10px] font-normal normal-case tracking-normal" style={{ color: "var(--warning)" }}>
                          (fallback)
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: "var(--ink-soft)" }}>
                      {m.content}
                    </p>
                    {m.tool_calls && m.tool_calls.length > 0 && (
                      <details className="mt-3 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                        <summary className="cursor-pointer hover:text-pink-deep">
                          Ver dados das {m.tool_calls.length} tool call(s)
                        </summary>
                        <div className="mt-2 space-y-2">
                          {m.tool_calls.map((t, i) => (
                            <div key={i} className="rounded-lg p-3 text-[11px] font-num" style={{ background: "var(--paper)", border: "1px solid var(--border-soft)" }}>
                              <div className="font-semibold mb-1" style={{ color: "var(--ink)" }}>{t.name}</div>
                              <div className="opacity-70 mb-1">input: {JSON.stringify(t.input)}</div>
                              <div className="opacity-70 truncate">output: {JSON.stringify(t.output).slice(0, 200)}{JSON.stringify(t.output).length > 200 ? "..." : ""}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-muted)" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Claude esta pensando + chamando tools...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="max-w-2xl mx-auto"
        >
          <div className="rounded-xl p-3" style={{ background: "var(--paper)", border: "1px solid var(--border)" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={hasCredentials === false ? "Configure ANTHROPIC_API_KEY no Vercel para ativar..." : "Pergunte sobre performance... (Enter para enviar)"}
              disabled={loading || hasCredentials === false}
              className="w-full bg-transparent text-[13px] resize-none focus:outline-none"
              style={{ color: "var(--ink)", minHeight: 40 }}
              rows={2}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
                Claude Opus 4.6 - 4 tools - max 5 iteracoes
              </span>
              <button
                type="submit"
                disabled={loading || !input.trim() || hasCredentials === false}
                className="pill pill-pink px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5 disabled:opacity-40"
              >
                <span>Enviar</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

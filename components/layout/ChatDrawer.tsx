"use client";

import { Sparkles, History, X, CornerDownRight, Paperclip, AtSign, ArrowUp } from "lucide-react";

export function ChatDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={`chat-drawer fixed lg:relative top-0 right-0 h-full w-full sm:w-[420px] lg:w-[380px] flex-shrink-0 flex flex-col z-50 lg:z-auto shadow-xl lg:shadow-none pt-safe pb-safe ${
        open ? "open" : ""
      }`}
      style={{
        background: "white",
        borderLeft: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 lg:w-7 lg:h-7 rounded-lg flex items-center justify-center"
            style={{ background: "var(--pink)" }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "white" }} />
          </div>
          <div>
            <div
              className="text-[13px] font-semibold"
              style={{ color: "var(--ink)" }}
            >
              Ask Claude
            </div>
            <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
              BQ · Meta · Klaviyo · Shopify
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-lg"
            style={{ color: "var(--ink-muted)" }}
            aria-label="Histórico"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{ color: "var(--ink-muted)" }}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scroll-area px-4 py-4 space-y-5">
        <div>
          <div className="chat-msg-ai-header">Claude</div>
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: "var(--ink-soft)" }}
          >
            Em breve: chat integrado com BigQuery, Meta, Klaviyo e Shopify via tool use. Disponível na Fase 4 do roadmap.
          </p>
        </div>

        <div className="space-y-1.5">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider px-1"
            style={{ color: "var(--ink-muted)" }}
          >
            Sugestões (preview)
          </div>
          <button className="chip-suggestion">
            <CornerDownRight
              className="w-3 h-3 flex-shrink-0"
              style={{ color: "var(--ink-muted)" }}
            />
            <span>Quais campanhas Meta US têm fadiga?</span>
          </button>
          <button className="chip-suggestion">
            <CornerDownRight
              className="w-3 h-3 flex-shrink-0"
              style={{ color: "var(--ink-muted)" }}
            />
            <span>Compara CVR Welcome BR vs US</span>
          </button>
          <button className="chip-suggestion">
            <CornerDownRight
              className="w-3 h-3 flex-shrink-0"
              style={{ color: "var(--ink-muted)" }}
            />
            <span>nCAC sem pré-order, 90d</span>
          </button>
        </div>
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 pb-safe"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div
          className="rounded-xl p-2.5"
          style={{ background: "var(--paper)", border: "1px solid var(--border)" }}
        >
          <textarea
            placeholder="Pergunte sobre performance... (em breve)"
            disabled
            className="w-full bg-transparent text-[13px] resize-none focus:outline-none opacity-50"
            style={{ color: "var(--ink)", minHeight: 36 }}
            rows={2}
          />
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 rounded opacity-40"
                style={{ color: "var(--ink-muted)" }}
                disabled
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 rounded opacity-40"
                style={{ color: "var(--ink-muted)" }}
                disabled
              >
                <AtSign className="w-4 h-4" />
              </button>
            </div>
            <button
              className="pill pill-pink px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5 opacity-50"
              disabled
            >
              <span>Send</span>
              <ArrowUp className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
            Claude Opus 4.7 · Fase 4
          </span>
        </div>
      </div>
    </aside>
  );
}

"use client";

import { Languages } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { EN_TO_PT } from "@/lib/i18n/dictionary-en-pt";

// Global EN ↔ PT translation toggle.
// Walks the DOM, swaps text nodes via the EN_TO_PT dictionary, and stores
// the original text in a WeakMap so we can revert with no data loss.
//
// Cassia 2026-06-13: "deixe todos os dashboards em ingles, mas inclua um botao
// em cada um onde eu possa traduzir automaticamente para o portugues".

const STORAGE_KEY = "lpos-lang";

// Build a lookup map keyed by lowercased trimmed text for resilient matching.
const LOOKUP: Map<string, string> = new Map();
for (const [en, pt] of Object.entries(EN_TO_PT)) {
  LOOKUP.set(en.toLowerCase().trim(), pt);
}

// Stash original (EN) text per node so the EN ↦ PT swap is reversible.
const ORIGINAL = new WeakMap<Text, string>();

function translateNode(node: Text, toPT: boolean) {
  const original = ORIGINAL.get(node) ?? node.nodeValue ?? "";
  if (!ORIGINAL.has(node)) ORIGINAL.set(node, original);

  if (!toPT) {
    if (node.nodeValue !== original) node.nodeValue = original;
    return;
  }

  const raw = original;
  const trimmed = raw.trim();
  if (!trimmed) return;

  // Direct hit on the whole string (most common case for labels / KPI tags).
  const direct = LOOKUP.get(trimmed.toLowerCase());
  if (direct) {
    const lead = raw.match(/^\s*/)?.[0] ?? "";
    const trail = raw.match(/\s*$/)?.[0] ?? "";
    node.nodeValue = lead + direct + trail;
    return;
  }

  // Substring fallback — replace any dictionary key found inside the text.
  let out = raw;
  for (const [k, v] of LOOKUP) {
    if (k.length < 3) continue; // skip tiny keys to avoid false-positives
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, v);
  }
  if (out !== raw) node.nodeValue = out;
}

function walk(root: Node, toPT: boolean) {
  // Skip script, style and editable inputs.
  const skip = (el: Element) =>
    el.tagName === "SCRIPT" ||
    el.tagName === "STYLE" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "INPUT" ||
    el.closest('[data-no-translate="true"]') !== null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (skip(parent)) return NodeFilter.FILTER_REJECT;
      const v = node.nodeValue;
      if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let n: Node | null;
  while ((n = walker.nextNode())) {
    translateNode(n as Text, toPT);
  }
}

export default function LanguageToggle() {
  const [lang, setLang] = useState<"en" | "pt">("en");
  const [mounted, setMounted] = useState(false);

  const applyLang = useCallback((next: "en" | "pt") => {
    if (typeof document === "undefined") return;
    walk(document.body, next === "pt");
    document.documentElement.setAttribute("lang", next === "pt" ? "pt-BR" : "en");
  }, []);

  // Hydrate from localStorage and start observing for new nodes.
  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem(STORAGE_KEY) as "en" | "pt" | null) || "en";
    setLang(stored);
    applyLang(stored);

    // Watch for new nodes (e.g. after a fetch finishes) and re-translate.
    const observer = new MutationObserver((mutations) => {
      const current = (localStorage.getItem(STORAGE_KEY) as "en" | "pt" | null) || "en";
      if (current !== "pt") return;
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) {
            walk(n, true);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });
    return () => observer.disconnect();
  }, [applyLang]);

  const toggle = useCallback(() => {
    const next = lang === "en" ? "pt" : "en";
    setLang(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyLang(next);
  }, [lang, applyLang]);

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      data-no-translate="true"
      title={lang === "en" ? "Traduzir para português" : "Switch to English"}
      style={{
        position: "fixed",
        bottom: 18,
        right: 18,
        zIndex: 9999,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 999,
        background: "var(--ink, #1a1a1a)",
        color: "white",
        border: "none",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        cursor: "pointer",
        boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <Languages style={{ width: 14, height: 14 }} />
      <span>{lang === "en" ? "EN · click for PT" : "PT · clique p/ EN"}</span>
    </button>
  );
}

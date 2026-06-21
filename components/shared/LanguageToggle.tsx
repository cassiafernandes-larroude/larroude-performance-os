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
// Two structures:
//   - DIRECT_LOOKUP for exact full-string matches (fastest path)
//   - SORTED_ENTRIES for substring replacement, sorted DESC by length so longer
//     phrases are replaced FIRST and don't get eaten by shorter substrings.
const DIRECT_LOOKUP: Map<string, string> = new Map();
const SORTED_ENTRIES: Array<[string, string, RegExp]> = [];

// Word-character regex tester (works with unicode like ×, →, ↔)
const WORD_CHAR = /[A-Za-z0-9]/;

for (const [en, pt] of Object.entries(EN_TO_PT)) {
  const norm = en.toLowerCase().trim();
  if (norm) DIRECT_LOOKUP.set(norm, pt);
}

// Cassia 2026-06-20: o substring pass SÓ aceita FRASES LONGAS multi-palavra (>=12 chars E
// com espaço). Palavras curtas/genéricas ("New", "Order", "Email", "Sales", "Spend", "days"…)
// e fragmentos ficam SOMENTE exact-match (DIRECT_LOOKUP) — assim NUNCA são trocados dentro de
// nomes de campanha/produto/anúncio/SKU ou textos livres (ex.: "Larroude New", "Pre-Order").
// Frases longas são distintas o bastante pra não aparecerem dentro de nomes de recursos.
const allEntries = Object.entries(EN_TO_PT).sort((a, b) => b[0].length - a[0].length);
for (const [en, pt] of allEntries) {
  if (en.length < 12 || !/\s/.test(en)) continue; // curtas/sem-espaço -> só exact-match
  const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  SORTED_ENTRIES.push([en, pt, new RegExp(escaped, "gi")]);
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
  const direct = DIRECT_LOOKUP.get(trimmed.toLowerCase());
  if (direct) {
    const lead = raw.match(/^\s*/)?.[0] ?? "";
    const trail = raw.match(/\s*$/)?.[0] ?? "";
    node.nodeValue = lead + direct + trail;
    return;
  }

  // Substring fallback — iterate from longest to shortest so phrases win over fragments.
  let out = raw;
  for (const [, pt, re] of SORTED_ENTRIES) {
    re.lastIndex = 0; // reset stateful regex
    out = out.replace(re, pt);
  }
  if (out !== raw) node.nodeValue = out;
}

// Seletores que indicam "nome próprio" — campanhas, produtos, flows, segmentos.
// Cassia 2026-06-13: "os nomes das campanhas / produtos / flows não devem ser traduzidos".
// Cobre: Klaviyo CRM, Klaviyo Journey, Channel Share campaigns, Main Dashboard
// Performance by Campaign, Products to Bet On, Unit Economics product cards,
// Inventory, Shopify product lists.
const PROPER_NAME_SELECTORS = [
  // Nomes de campanhas / flows / segmentos (Klaviyo CRM, Klaviyo Journey)
  ".campaign-name",
  ".flow-name",
  ".segment-name",
  ".product-name",
  ".sku",
  ".product .name",       // Klaviyo CRM table cell <td.product .name>
  ".product .sku",
  "[data-row-type='campaign']",
  "[data-row-type='flow']",
  "[data-row-type='segment']",
  "[data-row-type='product']",
  // Heuristica generica: qualquer celula <td> com class "name" dentro de listas
  ".list-table td.name",
  ".list-table .product .name",
  ".list-table .product .sku",
  // Headers de tabelas que contem nomes
  ".product-cell",
  ".flow-cell",
  ".campaign-cell",
  // Cassia 2026-06-20: classes reais de célula de nome usadas nos dashboards (CAC/LTV/Inventory/Category)
  ".name-cell",
  ".prod-name",
  ".promo-name",
  ".adset-name",
  ".ad-name",
  ".dim-name",
  // Qualquer elemento explicitamente marcado como nome de recurso de ferramenta (campanha/adset/anúncio)
  "[data-resource-name='true']",
];

// Padrões de texto que indicam ID/SKU/código — nunca traduzir.
// (e.g. "LAR123-RED-37", "Welcome_Flow_v3", "abc-12345")
const ID_LIKE = /^[A-Z]{2,}\d|^\w+_\w+_|^[A-Za-z0-9]{2,}-[A-Za-z0-9]{2,}-/;

function walk(root: Node, toPT: boolean) {
  // Skip script, style, editable inputs e proper-name selectors.
  const skip = (el: Element) => {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" ||
        el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
    if (el.closest('[data-no-translate="true"]')) return true;
    // Pula se está dentro de seletor de "proper name"
    for (const sel of PROPER_NAME_SELECTORS) {
      try {
        if (el.closest(sel)) return true;
      } catch { /* selector pode ser invalido em alguns browsers, ignora */ }
    }
    return false;
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (skip(parent)) return NodeFilter.FILTER_REJECT;
      const v = node.nodeValue;
      if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
      // Skip text que parece ID/SKU/código
      if (ID_LIKE.test(v.trim())) return NodeFilter.FILTER_REJECT;
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

"use client";

// Filtro de ORIGEM (fulfillment) reutilizável — multi-seleção via ?fulCats= na URL.
// Cassia 2026-06-17: usado em dashboards server-rendered sem FiltersBar (Overview, Consolidada).
// Vazio = Todas as origens.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { FULFILLMENT_CATEGORY_OPTIONS, type FulfillmentCategory } from "@/lib/shared/fulfillment-category";

export function FulfillmentFilter({ className = "" }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const raw = params.get("fulCats");
  const selected = new Set((raw ? raw.split(",").filter(Boolean) : []) as FulfillmentCategory[]);
  const isAll = selected.size === 0;

  const nav = (p: URLSearchParams) =>
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));

  const toggle = (c: FulfillmentCategory) => {
    const next = new Set(selected);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    const p = new URLSearchParams(params.toString());
    if (next.size === 0) p.delete("fulCats");
    else p.set("fulCats", [...next].join(","));
    nav(p);
  };

  const clear = () => {
    const p = new URLSearchParams(params.toString());
    p.delete("fulCats");
    nav(p);
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <span className="text-[11px] font-semibold mr-1" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>
        ORIGEM
      </span>
      <button onClick={clear} className={`pill ${isAll ? "pill-active" : "pill-inactive"} px-3 py-1 text-[12px] ${isAll ? "font-medium" : ""}`}>
        Todos
      </button>
      {FULFILLMENT_CATEGORY_OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => toggle(o.key)}
          className={`pill ${selected.has(o.key) ? "pill-active" : "pill-inactive"} px-3 py-1 text-[12px] ${selected.has(o.key) ? "font-medium" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

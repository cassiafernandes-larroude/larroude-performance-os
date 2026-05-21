"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal, RefreshCw, FileDown } from "lucide-react";
import type { Market, Period } from "@/types/metric";

const periods: Period[] = ["7d", "14d", "28d", "3M", "6M", "12M"];

export function FiltersBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const market = (params.get("market") || "US") as Market;
  const period = (params.get("period") || "28d") as Period;

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  return (
    <>
      {/* Mobile filter trigger */}
      <div
        className="lg:hidden flex items-center gap-2 mb-5 overflow-x-auto scroll-area pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        <button
          onClick={() => setFiltersOpen(true)}
          className="pill pill-ghost px-3 py-2 text-[12px] flex items-center gap-2 flex-shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Filtros</span>
        </button>
        <CountryPill market="US" active={market === "US"} onClick={() => updateParam("market", "US")} />
        <CountryPill market="BR" active={market === "BR"} onClick={() => updateParam("market", "BR")} />
        <button className="pill pill-active px-3 py-2 text-[12px] font-medium flex-shrink-0">
          {period}
        </button>
        <button
          onClick={() => router.refresh()}
          className="pill pill-pink px-3 py-2 text-[12px] font-medium flex items-center gap-1.5 flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Desktop filter bar */}
      <div className="hidden lg:flex items-center gap-3 mb-7 flex-wrap">
        <div className="flex items-center gap-2">
          <CountryPill market="US" active={market === "US"} onClick={() => updateParam("market", "US")} />
          <CountryPill market="BR" active={market === "BR"} onClick={() => updateParam("market", "BR")} />
        </div>

        <div className="w-px h-5" style={{ background: "var(--border)" }} />

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold mr-1" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>
            PERIODO
          </span>
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => updateParam("period", p)}
              className={`pill ${period === p ? "pill-active" : "pill-inactive"} px-3 py-1 text-[12px] ${period === p ? "font-medium" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>

        <button className="pill pill-ghost px-3 py-1.5 text-[12px] flex items-center gap-1.5 ml-auto">
          <FileDown className="w-3.5 h-3.5" />
          PDF
        </button>

        <button
          onClick={() => router.refresh()}
          className="pill pill-pink px-4 py-1.5 text-[12px] font-medium flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar agora
        </button>
      </div>

      {/* Mobile sheet */}
      {filtersOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end"
          onClick={() => setFiltersOpen(false)}
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgba(26,26,26,0.4)", backdropFilter: "blur(2px)" }}
          />
          <div
            className="relative w-full rounded-t-2xl shadow-2xl pb-safe"
            style={{ background: "white", maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>Filtros</h3>
              <button onClick={() => setFiltersOpen(false)} className="text-[12px]" style={{ color: "var(--ink-muted)" }}>Fechar</button>
            </div>
            <div className="px-5 py-5 space-y-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--ink-muted)" }}>Mercado</div>
                <div className="flex gap-2">
                  <CountryPill market="US" active={market === "US"} onClick={() => { updateParam("market", "US"); setFiltersOpen(false); }} />
                  <CountryPill market="BR" active={market === "BR"} onClick={() => { updateParam("market", "BR"); setFiltersOpen(false); }} />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--ink-muted)" }}>Periodo</div>
                <div className="grid grid-cols-3 gap-2">
                  {periods.map((p) => (
                    <button
                      key={p}
                      onClick={() => { updateParam("period", p); setFiltersOpen(false); }}
                      className={`pill ${period === p ? "pill-active" : "pill-inactive"} py-2 text-[12px] ${period === p ? "font-medium" : ""}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CountryPill({ market, active, onClick }: { market: Market; active: boolean; onClick: () => void }) {
  const label = market === "US" ? "United States" : "Brasil";
  return (
    <button
      onClick={onClick}
      className={`country-pill ${active ? "country-pill-active" : "country-pill-inactive"} flex-shrink-0`}
    >
      <span className="country-code">{market}</span>
      <span>{label}</span>
    </button>
  );
}

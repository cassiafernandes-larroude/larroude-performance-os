"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SlidersHorizontal, RefreshCw, FileDown, Calendar } from "lucide-react";
import type { Market, Period } from "@/types/metric";
import { FULFILLMENT_CATEGORY_OPTIONS, type FulfillmentCategory } from "@/lib/shared/fulfillment-category";

const periods: Period[] = ["7d", "14d", "28d", "3M", "6M", "12M"];

// Calcula valor default De/Ate baseado no preset
function presetRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const to = new Date(today.getTime() - 24 * 3600 * 1000); // ontem
  const days = { "today": 1, "7d": 7, "14d": 14, "28d": 28, "3M": 90, "6M": 180, "12M": 365 }[period];
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Quantos dias entre duas datas
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
}

// Granularidade que será aplicada
function granularityLabel(days: number): string {
  if (days <= 28) return "diario";
  if (days <= 90) return "semanal";
  return "mensal";
}

export function FiltersBar({ hidePeriod = false, hideDateRange = false, showFulfillment = false }: { hidePeriod?: boolean; hideDateRange?: boolean; showFulfillment?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const market = (params.get("market") || "US") as Market;
  const period = (params.get("period") || "28d") as Period;
  const urlFrom = params.get("from");
  const urlTo = params.get("to");
  const isCustom = !!(urlFrom && urlTo);

  // Cassia 2026-06-17: filtro de origem de fulfillment (multi-seleção). Vazio = Todos.
  const fulCatsParam = params.get("fulCats");
  const selectedFul = new Set((fulCatsParam ? fulCatsParam.split(",").filter(Boolean) : []) as FulfillmentCategory[]);
  const fulIsAll = selectedFul.size === 0;
  const toggleFul = (c: FulfillmentCategory) => {
    const next = new Set(selectedFul);
    if (next.has(c)) next.delete(c); else next.add(c);
    const p = new URLSearchParams(params.toString());
    if (next.size === 0) p.delete("fulCats"); else p.set("fulCats", [...next].join(","));
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const clearFul = () => {
    const p = new URLSearchParams(params.toString());
    p.delete("fulCats");
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  // Estado local dos inputs De/Ate (so commita ao clicar Aplicar)
  const defaultRange = isCustom ? { from: urlFrom!, to: urlTo! } : presetRange(period);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  // Quando URL muda externamente, sincroniza
  useEffect(() => {
    const newDefault = isCustom ? { from: urlFrom!, to: urlTo! } : presetRange(period);
    setFrom(newDefault.from);
    setTo(newDefault.to);
  }, [urlFrom, urlTo, period, isCustom]);

  const setPreset = (p: Period) => {
    const next = new URLSearchParams(params.toString());
    next.set("period", p);
    next.delete("from");
    next.delete("to");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const setMarket = (m: Market) => {
    const next = new URLSearchParams(params.toString());
    next.set("market", m);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const applyCustom = () => {
    if (!from || !to || from > to) return;
    const next = new URLSearchParams(params.toString());
    next.set("from", from);
    next.set("to", to);
    next.delete("period");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const dayCount = daysBetween(from, to);
  const gran = granularityLabel(dayCount);
  const today = new Date();
  const maxDate = new Date(today.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);

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
          <span>Filters</span>
        </button>
        <CountryPill market="US" active={market === "US"} onClick={() => setMarket("US")} />
        <CountryPill market="BR" active={market === "BR"} onClick={() => setMarket("BR")} />
        <button className="pill pill-active px-3 py-2 text-[12px] font-medium flex-shrink-0">
          {isCustom ? "Custom" : period}
        </button>
        <button
          onClick={() => router.refresh()}
          className="pill pill-pink px-3 py-2 text-[12px] font-medium flex items-center gap-1.5 flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Desktop filter bar */}
      <div className="hidden lg:flex items-center gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CountryPill market="US" active={market === "US"} onClick={() => setMarket("US")} />
          <CountryPill market="BR" active={market === "BR"} onClick={() => setMarket("BR")} />
        </div>

        <div className="w-px h-5" style={{ background: "var(--border)" }} />

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold mr-1" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>
            PERIODO
          </span>
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`pill ${!isCustom && period === p ? "pill-active" : "pill-inactive"} px-3 py-1 text-[12px] ${!isCustom && period === p ? "font-medium" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>

        {showFulfillment && (
          <>
            <div className="w-px h-5" style={{ background: "var(--border)" }} />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold mr-1" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>ORIGEM</span>
              <button onClick={clearFul} className={`pill ${fulIsAll ? "pill-active" : "pill-inactive"} px-3 py-1 text-[12px] ${fulIsAll ? "font-medium" : ""}`}>Todos</button>
              {FULFILLMENT_CATEGORY_OPTIONS.map((o) => (
                <button key={o.key} onClick={() => toggleFul(o.key)} className={`pill ${selectedFul.has(o.key) ? "pill-active" : "pill-inactive"} px-3 py-1 text-[12px] ${selectedFul.has(o.key) ? "font-medium" : ""}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="w-px h-5" style={{ background: "var(--border)" }} />

        {/* Calendario customizado */}
        <div className="flex items-center gap-2 text-[12px]">
          <span style={{ color: "var(--ink-muted)" }}>From</span>
          <input
            type="date"
            value={from}
            max={to || maxDate}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2.5 py-1 rounded-lg font-num text-[12px]"
            style={{ background: "white", border: "1px solid var(--border)", color: "var(--ink)" }}
          />
          <span style={{ color: "var(--ink-muted)" }}>to</span>
          <input
            type="date"
            value={to}
            min={from}
            max={maxDate}
            onChange={(e) => setTo(e.target.value)}
            className="px-2.5 py-1 rounded-lg font-num text-[12px]"
            style={{ background: "white", border: "1px solid var(--border)", color: "var(--ink)" }}
          />
          <button
            onClick={applyCustom}
            disabled={!from || !to || from > to}
            className="pill pill-active px-4 py-1.5 text-[12px] font-medium disabled:opacity-40"
          >
            Aplicar
          </button>
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

      {/* Info da janela ativa (desktop) */}
      <div className="hidden lg:flex items-center gap-2 text-[11px] mb-7" style={{ color: "var(--ink-muted)" }}>
        <Calendar className="w-3 h-3" />
        <span>
          {isCustom ? "Custom" : period} - <strong style={{ color: "var(--ink-soft)" }}>{from} a {to}</strong> - {dayCount} dias - bars <strong style={{ color: "var(--ink-soft)" }}>{gran}</strong>
        </span>
      </div>

      {/* Mobile sheet */}
      {filtersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" onClick={() => setFiltersOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(26,26,26,0.4)", backdropFilter: "blur(2px)" }} />
          <div
            className="relative w-full rounded-t-2xl shadow-2xl pb-safe"
            style={{ background: "white", maxHeight: "85vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>Filtros</h3>
              <button onClick={() => setFiltersOpen(false)} className="text-[12px]" style={{ color: "var(--ink-muted)" }}>Close</button>
            </div>
            <div className="px-5 py-5 space-y-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--ink-muted)" }}>Mercado</div>
                <div className="flex gap-2">
                  <CountryPill market="US" active={market === "US"} onClick={() => { setMarket("US"); setFiltersOpen(false); }} />
                  <CountryPill market="BR" active={market === "BR"} onClick={() => { setMarket("BR"); setFiltersOpen(false); }} />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--ink-muted)" }}>Periodo</div>
                <div className="grid grid-cols-3 gap-2">
                  {periods.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPreset(p); setFiltersOpen(false); }}
                      className={`pill ${!isCustom && period === p ? "pill-active" : "pill-inactive"} py-2 text-[12px] ${!isCustom && period === p ? "font-medium" : ""}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--ink-muted)" }}>Periodo customizado</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <label className="block">
                    <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>De</span>
                    <input type="date" value={from} max={to || maxDate} onChange={(e) => setFrom(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg font-num text-[13px]"
                      style={{ background: "var(--paper)", border: "1px solid var(--border)", color: "var(--ink)" }} />
                  </label>
                  <label className="block">
                    <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>Até</span>
                    <input type="date" value={to} min={from} max={maxDate} onChange={(e) => setTo(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg font-num text-[13px]"
                      style={{ background: "var(--paper)", border: "1px solid var(--border)", color: "var(--ink)" }} />
                  </label>
                </div>
                <p className="text-[11px] mb-2" style={{ color: "var(--ink-muted)" }}>{dayCount} days - bars {gran}</p>
                <button
                  onClick={() => { applyCustom(); setFiltersOpen(false); }}
                  disabled={!from || !to || from > to}
                  className="w-full pill pill-active py-3 text-[13px] font-medium disabled:opacity-40"
                >
                  Aplicar periodo customizado
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CountryPill({ market, active, onClick }: { market: Market; active: boolean; onClick: () => void }) {
  const label = market === "US" ? "United States" : "Brazil";
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

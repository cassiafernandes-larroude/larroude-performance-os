"use client";

import { useState } from "react";
import { SlidersHorizontal, RefreshCw, FileDown } from "lucide-react";

const periods = ["7d", "14d", "28d", "3M", "6M", "12M"] as const;
type Period = (typeof periods)[number];
type Market = "US" | "BR";

export function FiltersBar() {
  const [market, setMarket] = useState<Market>("US");
  const [period, setPeriod] = useState<Period>("28d");
  const [filtersOpen, setFiltersOpen] = useState(false);

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
        <CountryPill
          market="US"
          active={market === "US"}
          onClick={() => setMarket("US")}
        />
        <CountryPill
          market="BR"
          active={market === "BR"}
          onClick={() => setMarket("BR")}
        />
        <button className="pill pill-active px-3 py-2 text-[12px] font-medium flex-shrink-0">
          {period}
        </button>
        <button className="pill pill-pink px-3 py-2 text-[12px] font-medium flex items-center gap-1.5 flex-shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Desktop filter bar */}
      <div className="hidden lg:flex items-center gap-3 mb-7 flex-wrap">
        <div className="flex items-center gap-2">
          <CountryPill
            market="US"
            active={market === "US"}
            onClick={() => setMarket("US")}
          />
          <CountryPill
            market="BR"
            active={market === "BR"}
            onClick={() => setMarket("BR")}
          />
        </div>

        <div
          className="w-px h-5"
          style={{ background: "var(--border)" }}
        />

        <div className="flex items-center gap-1.5">
          <span
            className="text-[11px] font-semibold mr-1"
            style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
          >
            PERÍODO
          </span>
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`pill ${
                period === p ? "pill-active" : "pill-inactive"
              } px-3 py-1 text-[12px] ${period === p ? "font-medium" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="w-px h-5" style={{ background: "var(--border)" }} />

        <div className="flex items-center gap-2 text-[12px]">
          <span style={{ color: "var(--ink-muted)" }}>De</span>
          <input
            type="text"
            defaultValue="23/04/2026"
            className="px-2.5 py-1 rounded-lg font-num text-[12px]"
            style={{
              background: "white",
              border: "1px solid var(--border)",
              color: "var(--ink)",
              width: 110,
            }}
          />
          <span style={{ color: "var(--ink-muted)" }}>até</span>
          <input
            type="text"
            defaultValue="20/05/2026"
            className="px-2.5 py-1 rounded-lg font-num text-[12px]"
            style={{
              background: "white",
              border: "1px solid var(--border)",
              color: "var(--ink)",
              width: 110,
            }}
          />
        </div>

        <button className="pill pill-active px-4 py-1.5 text-[12px] font-medium">
          Aplicar
        </button>

        <button className="pill pill-ghost px-3 py-1.5 text-[12px] flex items-center gap-1.5">
          <FileDown className="w-3.5 h-3.5" />
          PDF
        </button>

        <button className="pill pill-pink px-4 py-1.5 text-[12px] font-medium flex items-center gap-1.5 ml-auto">
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar agora
        </button>
      </div>
    </>
  );
}

function CountryPill({
  market,
  active,
  onClick,
}: {
  market: Market;
  active: boolean;
  onClick: () => void;
}) {
  const label = market === "US" ? "United States" : "Brasil";
  return (
    <button
      onClick={onClick}
      className={`country-pill ${
        active ? "country-pill-active" : "country-pill-inactive"
      } flex-shrink-0`}
    >
      <span className="country-code">{market}</span>
      <span>{label}</span>
    </button>
  );
}

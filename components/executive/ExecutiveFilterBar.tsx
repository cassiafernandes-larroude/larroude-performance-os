"use client";

/**
 * Cassia 2026-06-12: filtro de período no Executive View, mesmo formato visual
 * do Main Dashboard (pills 7D/14D/28D/3M/6M/12M + custom range + Apply).
 *
 * Estado persistido via URL (?period=28d ou ?from=... &to=...) — Refresh button
 * faz router.refresh() e troca persiste em bookmark.
 */

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Cassia 2026-06-13: adicionado preset "1d" (Ontem / D-1) no inicio
type Preset = "1d" | "7d" | "14d" | "28d" | "3M" | "6M" | "12M";
const PRESETS: Preset[] = ["1d", "7d", "14d", "28d", "3M", "6M", "12M"];

const PILL_BASE =
  "inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none";
const PILL_ACTIVE = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-5 py-1.5 sm:py-2`;

interface Props {
  maxDate: string;
}

function isoDaysAgo(days: number, ref: Date = new Date()): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function defaultStartFor(preset: Preset, refDate: string): string {
  if (preset === "1d") return refDate; // somente ontem
  const ref = new Date(refDate + "T12:00:00");
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : preset === "28d" ? 28
             : preset === "3M" ? 90 : preset === "6M" ? 180 : 365;
  return isoDaysAgo(days - 1, ref);
}

function periodLabel(preset: Preset | "custom", days?: number): string {
  if (preset === "custom") return days ? `Last ${days} day${days === 1 ? "" : "s"}` : "Custom range";
  switch (preset) {
    case "1d": return "Yesterday";
    case "7d": return "Last 7 days";
    case "14d": return "Last 14 days";
    case "28d": return "Last 28 days";
    case "3M": return "Last 3 months";
    case "6M": return "Last 6 months";
    case "12M": return "Last 12 months";
  }
}

export default function ExecutiveFilterBar({ maxDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlPreset = (sp.get("period") as Preset) || "28d";
  const urlFrom = sp.get("from");
  const urlTo = sp.get("to");
  const isCustom = !!(urlFrom && urlTo);

  const [draftStart, setDraftStart] = useState(urlFrom || defaultStartFor(urlPreset, maxDate));
  const [draftEnd, setDraftEnd] = useState(urlTo || maxDate);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setDraftStart(urlFrom || defaultStartFor(urlPreset, maxDate));
    setDraftEnd(urlTo || maxDate);
  }, [urlFrom, urlTo, urlPreset, maxDate]);

  const setPreset = (p: Preset) => {
    const params = new URLSearchParams();
    params.set("period", p);
    router.push(`${pathname}?${params}`);
  };

  const applyCustom = () => {
    if (!draftStart || !draftEnd) {
      alert("Select start and end date.");
      return;
    }
    if (draftStart > draftEnd) {
      alert("Start must be before end.");
      return;
    }
    const params = new URLSearchParams();
    params.set("from", draftStart);
    params.set("to", draftEnd);
    router.push(`${pathname}?${params}`);
  };

  const onRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 900);
  };

  const activePreset = isCustom ? "custom" : urlPreset;
  const customDays = isCustom
    ? Math.max(
        1,
        Math.round(
          (new Date(urlTo + "T12:00:00").getTime() -
            new Date(urlFrom + "T12:00:00").getTime()) /
            86400000
        ) + 1
      )
    : undefined;

  return (
    <div
      className="px-3 sm:px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 mb-5 no-print"
      style={{ background: "white", border: "0.8px solid #e5e3de" }}
    >
      <span
        className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1"
        style={{ color: "#9ca3af" }}
      >
        Period
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => {
          const active = activePreset === p;
          return (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={active ? PILL_ACTIVE : PILL_INACTIVE}
            >
              {p === "1d" ? "D-1" : p.toUpperCase()}
            </button>
          );
        })}
      </div>

      <div className="h-7 w-px mx-1" style={{ background: "#e5e3de" }} />

      <input
        type="date"
        value={draftStart}
        onChange={(e) => setDraftStart(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }}
        className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
        style={{
          border: `1px solid ${isCustom ? "#d97757" : "#e5e3de"}`,
          boxShadow: isCustom ? "0 0 0 1px rgba(217,119,87,0.30)" : "none",
        }}
      />
      <span className="text-[13px]" style={{ color: "#6b7280" }}>to</span>
      <input
        type="date"
        value={draftEnd}
        max={maxDate}
        onChange={(e) => setDraftEnd(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }}
        className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
        style={{
          border: `1px solid ${isCustom ? "#d97757" : "#e5e3de"}`,
          boxShadow: isCustom ? "0 0 0 1px rgba(217,119,87,0.30)" : "none",
        }}
      />
      <button onClick={applyCustom} className={PILL_ACTIVE} title="Apply date range">
        Apply
      </button>

      <span className="text-[13px] italic px-2 ml-auto" style={{ color: "#9ca3af" }}>
        {periodLabel(activePreset as Preset | "custom", customDays)}
      </span>

      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="pill pill-pink px-3 py-1.5 text-[12px] flex items-center gap-1.5 font-medium"
        style={{ opacity: refreshing ? 0.6 : 1, cursor: refreshing ? "wait" : "pointer" }}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        <span>{refreshing ? "Refreshing..." : "Refresh now"}</span>
      </button>
    </div>
  );
}

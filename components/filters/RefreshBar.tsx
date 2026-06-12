"use client";

import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Cassia 2026-06-12: toggle Yesterday/Today + Refresh button no Overview.
 * "Today" usa dados intra-dia (D0) no fuso do market correspondente.
 * "Yesterday" (default) mostra D-1 — último dia consolidado.
 */
export function RefreshBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const day = (searchParams.get("day") === "today" ? "today" : "yesterday") as
    | "today"
    | "yesterday";
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 900);
  };

  const setDay = (next: "today" | "yesterday") => {
    if (next === day) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (next === "today") params.set("day", "today");
    else params.delete("day");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Labels de data (usa NY como referência genérica do painel)
  const todayLabel = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const yesterdayLabel = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const pillBase =
    "px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors select-none";
  const pillActive = "bg-[#1a1a1a] text-white";
  const pillInactive = "bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0]";

  return (
    <div
      className="flex items-center justify-between mb-4 lg:mb-5 px-3 py-2.5 rounded-xl gap-3 flex-wrap"
      style={{ background: "var(--paper-deep)", border: "1px solid var(--border-soft)" }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider mr-1"
          style={{ color: "var(--ink-muted)" }}
        >
          View
        </span>
        <button
          type="button"
          onClick={() => setDay("yesterday")}
          className={`${pillBase} ${day === "yesterday" ? pillActive : pillInactive}`}
          aria-pressed={day === "yesterday"}
        >
          Yesterday (D-1)
        </button>
        <button
          type="button"
          onClick={() => setDay("today")}
          className={`${pillBase} ${day === "today" ? pillActive : pillInactive}`}
          aria-pressed={day === "today"}
        >
          Today (live)
        </button>
        <span className="text-[12px] font-num ml-1" style={{ color: "var(--ink-soft)" }}>
          {day === "today" ? todayLabel : yesterdayLabel}
        </span>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="pill pill-pink px-3 py-1.5 text-[12px] flex items-center gap-1.5 font-medium"
        style={{ opacity: refreshing ? 0.6 : 1, cursor: refreshing ? "wait" : "pointer" }}
        aria-label="Refresh data now"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        <span>{refreshing ? "Refreshing..." : "Refresh now"}</span>
      </button>
    </div>
  );
}

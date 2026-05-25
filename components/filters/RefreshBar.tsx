"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshBar() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 900);
  };

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="flex items-center justify-between mb-4 lg:mb-5 px-3 py-2.5 rounded-xl"
      style={{ background: "var(--paper-deep)", border: "1px solid var(--border-soft)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-muted)" }}
        >
          Today
        </span>
        <span className="text-[12px] font-num" style={{ color: "var(--ink)", fontWeight: 500 }}>
          {today}
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

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileDown, RefreshCw } from "lucide-react";

// PDF + Refresh now buttons - shared across native dashboards.
// PDF: window.print() (estilos @media print no globals.css cuidam do layout)
// Refresh: router.refresh() (revalida server components + ISR)

export function DashboardActions({
  onRefresh,
  label = "Refresh now",
  className,
}: {
  onRefresh?: () => Promise<void> | void;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const handleRefresh = async () => {
    setBusy(true);
    try {
      if (onRefresh) await onRefresh();
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  const handlePdf = () => {
    if (typeof window !== "undefined") window.print();
  };

  const refreshing = busy || isPending;

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <button
        onClick={handlePdf}
        className="pill pill-ghost px-3 py-1.5 text-[12px] flex items-center gap-1.5"
        title="Export as PDF"
      >
        <FileDown className="w-3.5 h-3.5" />
        <span>PDF</span>
      </button>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="pill pill-pink px-3 py-1.5 text-[12px] flex items-center gap-1.5 font-medium"
        title="Reload data"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        <span>{refreshing ? "Refreshing..." : label}</span>
      </button>
    </div>
  );
}

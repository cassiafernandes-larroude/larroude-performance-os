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

  // Cassia 2026-06-13: "melhore a visualizacao do botao atualizar agora"
  // Texto branco/creme sobre fundo creme ficava ilegivel. Usando estilos inline
  // com cores explicitas pra garantir contraste em qualquer escopo CSS.
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <button
        onClick={handlePdf}
        className="flex items-center gap-1.5"
        title="Export as PDF"
        style={{
          padding: "8px 14px",
          borderRadius: 999,
          background: "#FFFFFF",
          color: "#1A1A1A",
          border: "1.5px solid #E5E0D6",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.15s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <FileDown style={{ width: 14, height: 14, color: "#1A1A1A" }} />
        <span>PDF</span>
      </button>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5"
        title="Reload data"
        style={{
          padding: "8px 16px",
          borderRadius: 999,
          background: refreshing ? "#E91E63" : "#FF3D8B",
          color: "#FFFFFF",
          border: "none",
          fontSize: 12,
          fontWeight: 700,
          cursor: refreshing ? "wait" : "pointer",
          opacity: refreshing ? 0.7 : 1,
          transition: "all 0.15s",
          boxShadow: "0 2px 8px rgba(255, 61, 139, 0.3)",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.background = "#E91E63"; }}
        onMouseLeave={(e) => { if (!refreshing) e.currentTarget.style.background = "#FF3D8B"; }}
      >
        <RefreshCw style={{ width: 14, height: 14, color: "#FFFFFF" }} className={refreshing ? "animate-spin" : ""} />
        <span style={{ color: "#FFFFFF" }}>{refreshing ? "Refreshing..." : label}</span>
      </button>
    </div>
  );
}

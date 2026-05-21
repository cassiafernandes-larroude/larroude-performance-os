"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export function DiagnosticsFilters({ counts }: {
  counts: { critical: number; warning: number; positive: number; info: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const severity = params.get("severity");
  const market = params.get("market");
  const period = params.get("period") || "28d";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold mr-1" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>SEVERIDADE</span>
        <FilterPill label={`Todos (${Object.values(counts).reduce((a, b) => a + b, 0)})`} active={!severity} onClick={() => setParam("severity", null)} />
        <FilterPill label={`Critico (${counts.critical})`} active={severity === "critical"} onClick={() => setParam("severity", "critical")} color="negative" />
        <FilterPill label={`Atencao (${counts.warning})`} active={severity === "warning"} onClick={() => setParam("severity", "warning")} color="warning" />
        <FilterPill label={`Positivo (${counts.positive})`} active={severity === "positive"} onClick={() => setParam("severity", "positive")} color="positive" />
        <FilterPill label={`Gap (${counts.info})`} active={severity === "info"} onClick={() => setParam("severity", "info")} color="info" />
      </div>

      <div className="w-px h-5" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold mr-1" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>MERCADO</span>
        <FilterPill label="Todos" active={!market} onClick={() => setParam("market", null)} />
        <FilterPill label="US" active={market === "US"} onClick={() => setParam("market", "US")} />
        <FilterPill label="BR" active={market === "BR"} onClick={() => setParam("market", "BR")} />
      </div>

      <div className="w-px h-5" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold mr-1" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>PERIODO</span>
        {(["7d", "14d", "28d", "3M"] as const).map((p) => (
          <FilterPill key={p} label={p} active={period === p} onClick={() => setParam("period", p)} />
        ))}
      </div>
    </div>
  );
}

function FilterPill({ label, active, onClick }: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: "negative" | "warning" | "positive" | "info";
}) {
  return (
    <button
      onClick={onClick}
      className={`pill ${active ? "pill-active" : "pill-inactive"} px-3 py-1 text-[12px] ${active ? "font-medium" : ""}`}
    >
      {label}
    </button>
  );
}

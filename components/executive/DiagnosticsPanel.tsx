// Cause & Effect diagnostics panel for Consolidated View.
// Renders the output of computeExecutiveDiagnostics() as a list of cards
// sorted by severity (critical → warning → info → positive).

import { AlertTriangle, AlertCircle, Info, CheckCircle2, ArrowRight } from "lucide-react";
import type { Diagnostic, DiagnosticSeverity } from "@/lib/data/executive-diagnostics";

const SEVERITY_STYLES: Record<
  DiagnosticSeverity,
  { color: string; bg: string; border: string; icon: React.ReactNode; label: string }
> = {
  critical: {
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: <AlertCircle className="w-4 h-4" />,
    label: "CRITICAL",
  },
  warning: {
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a",
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "WARNING",
  },
  info: {
    color: "#1e40af",
    bg: "#eff6ff",
    border: "#bfdbfe",
    icon: <Info className="w-4 h-4" />,
    label: "INFO",
  },
  positive: {
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: <CheckCircle2 className="w-4 h-4" />,
    label: "HEALTHY",
  },
};

export default function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return (
      <div className="card text-center py-6 mb-6">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--positive)" }} />
        <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
          No anomalies detected in this period. All KPIs within healthy ranges.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="section-marker mb-3">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-muted)" }}
        >
          CAUSE &amp; EFFECT DIAGNOSTICS · {diagnostics.length} SIGNAL{diagnostics.length === 1 ? "" : "S"} DETECTED
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {diagnostics.map((d) => {
          const s = SEVERITY_STYLES[d.severity];
          return (
            <div
              key={d.id}
              className="card"
              style={{
                borderLeft: `4px solid ${s.color}`,
                background: s.bg,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold"
                  style={{
                    fontSize: 9,
                    background: s.color,
                    color: "white",
                    letterSpacing: "0.05em",
                  }}
                >
                  {s.icon}
                  {s.label}
                </span>
              </div>
              <div className="mb-2">
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: s.color, letterSpacing: "0.04em" }}
                >
                  Cause
                </div>
                <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                  {d.cause}
                </div>
              </div>
              <div className="mb-2 flex items-start gap-2">
                <ArrowRight
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: s.color }}
                />
                <div className="flex-1">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                    style={{ color: s.color, letterSpacing: "0.04em" }}
                  >
                    Effect
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                    {d.effect}
                  </div>
                </div>
              </div>
              {d.evidence.length > 0 && (
                <div
                  className="rounded p-2 mb-2"
                  style={{ background: "rgba(255,255,255,0.7)", border: `1px solid ${s.border}` }}
                >
                  <div
                    className="text-[9px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    Evidence
                  </div>
                  <ul className="space-y-0.5">
                    {d.evidence.map((e, i) => (
                      <li
                        key={i}
                        className="text-[11px] font-num"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        · {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.recommendation && (
                <div
                  className="text-[11px] italic flex items-start gap-1"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <span style={{ color: s.color }}>→</span>
                  <span>{d.recommendation}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

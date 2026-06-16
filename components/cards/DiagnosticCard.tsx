import { AlertTriangle, Package, TrendingUp, ZapOff, Lightbulb, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type Severity = "critical" | "warning" | "positive" | "info";

const severityConfig: Record<
  Severity,
  { label: string; badge: string; bg: string; iconColor: string; icon: ReactNode }
> = {
  critical: {
    label: "CRÍTICO",
    badge: "status-critico",
    bg: "var(--negative-soft)",
    iconColor: "var(--negative)",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  warning: {
    label: "ATENÇÃO",
    badge: "status-escalar",
    bg: "var(--warning-soft)",
    iconColor: "var(--warning)",
    icon: <Package className="w-4 h-4" />,
  },
  positive: {
    label: "POSITIVO",
    badge: "status-ativo",
    bg: "var(--positive-soft)",
    iconColor: "var(--positive)",
    icon: <TrendingUp className="w-4 h-4" />,
  },
  info: {
    label: "GAP",
    badge: "",
    bg: "var(--pink-soft)",
    iconColor: "var(--pink-deep)",
    icon: <ZapOff className="w-4 h-4" />,
  },
};

export function DiagnosticCard({
  severity,
  meta,
  title,
  body,
  recommendation,
}: {
  severity: Severity;
  meta: string;
  title: string;
  body: ReactNode;
  recommendation: string;
}) {
  const cfg = severityConfig[severity];
  return (
    <div className={`diagnostic-card ${severity}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: cfg.bg, color: cfg.iconColor }}
          >
            {cfg.icon}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`badge ${cfg.badge}`}
              style={
                severity === "info"
                  ? {
                      background: "var(--pink-soft)",
                      color: "var(--pink-deep)",
                    }
                  : undefined
              }
            >
              {cfg.label}
            </span>
            <span
              className="text-[10px] font-medium"
              style={{ color: "var(--ink-muted)", letterSpacing: "0.04em" }}
            >
              {meta}
            </span>
          </div>
          <h3
            className="text-[14px] font-semibold mb-1.5"
            style={{ color: "var(--ink)" }}
          >
            {title}
          </h3>
          <div
            className="text-[12px] leading-relaxed mb-3"
            style={{ color: "var(--ink-soft)" }}
          >
            {body}
          </div>
          <div
            className="pt-2 flex items-center justify-between gap-2"
            style={{ borderTop: "1px solid var(--border-soft)" }}
          >
            <span
              className="text-[11px] flex items-center gap-1.5 min-w-0"
              style={{ color: "var(--pink-deep)" }}
            >
              <Lightbulb className="w-3 h-3 flex-shrink-0" />
              <span style={{ fontWeight: 500 }} className="truncate">
                {recommendation}
              </span>
            </span>
            <button
              className="text-[11px] flex items-center gap-1 flex-shrink-0"
              style={{ color: "var(--ink-muted)" }}
              aria-label="Ver detalhes"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

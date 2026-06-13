export type MetricDelta = {
  value: string;
  positive: boolean;
};

export function MetricCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: MetricDelta;
  hint?: string;
}) {
  return (
    <div className="card flex flex-col" style={{ minHeight: 110 }}>
      {/* Label: 2 linhas reservadas — valores ficam alinhados horizontalmente
          independente do label ter 1 ou 2 linhas (Cassia 2026-06-13). */}
      <div
        className="label-meta"
        style={{
          minHeight: 28,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div className="metric-value font-num">{value}</div>
      <div className="mt-auto pt-1.5" style={{ minHeight: 18 }}>
        {delta && (
          <div
            className={`${
              delta.positive ? "metric-delta-pos" : "metric-delta-neg"
            } flex items-center gap-1`}
          >
            <span>{delta.positive ? "▲" : "▼"}</span>
            <span className="font-num">{delta.value}</span>
          </div>
        )}
        {!delta && hint && (
          <div
            className="text-[10px] lg:text-[11px]"
            style={{ color: "var(--ink-muted)" }}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

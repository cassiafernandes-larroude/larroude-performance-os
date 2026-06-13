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
    // Grid de 3 linhas com alturas fixas — garante alinhamento horizontal dos
    // valores entre todos os cards (Cassia 2026-06-13).
    <div
      className="card"
      style={{
        display: "grid",
        gridTemplateRows: "36px 36px auto",
        rowGap: 4,
        minHeight: 120,
      }}
    >
      <div
        className="label-meta"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          alignSelf: "start",
        }}
      >
        {label}
      </div>
      <div className="metric-value font-num" style={{ alignSelf: "center" }}>
        {value}
      </div>
      <div style={{ alignSelf: "end", minHeight: 18 }}>
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

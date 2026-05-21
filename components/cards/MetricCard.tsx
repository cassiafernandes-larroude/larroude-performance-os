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
    <div className="card">
      <div className="label-meta mb-2">{label}</div>
      <div className="metric-value font-num">{value}</div>
      {delta && (
        <div
          className={`${
            delta.positive ? "metric-delta-pos" : "metric-delta-neg"
          } mt-1.5 flex items-center gap-1`}
        >
          <span>{delta.positive ? "▲" : "▼"}</span>
          <span className="font-num">{delta.value}</span>
        </div>
      )}
      {!delta && hint && (
        <div
          className="text-[10px] lg:text-[11px] mt-1.5"
          style={{ color: "var(--ink-muted)" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

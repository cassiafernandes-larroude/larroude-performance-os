import { getMetricBundle } from "@/lib/data/metrics";
import { zscore } from "@/lib/intelligence/diagnostics";
import { Activity } from "lucide-react";

export const revalidate = 300;

export default async function AnomaliesPage() {
  const [us, br] = await Promise.all([
    getMetricBundle("US", "28d"),
    getMetricBundle("BR", "28d"),
  ]);

  type Row = { market: string; metric: string; label: string; delta: number; z: number };
  const rows: Row[] = [];
  for (const bundle of [us, br]) {
    const deltas = bundle.metrics.map((m) => m.delta_pct).filter((x): x is number => x !== null);
    if (deltas.length < 3) continue;
    for (const m of bundle.metrics) {
      if (m.delta_pct === null) continue;
      const z = zscore(deltas, m.delta_pct);
      if (Math.abs(z) > 1.5) {
        rows.push({ market: bundle.market, metric: m.key, label: m.label, delta: m.delta_pct, z });
      }
    }
  }
  rows.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>Anomalies</h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Detection via z-score (|z| {">"} 1.5) - {rows.length} anomalies detected
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-12" style={{ color: "var(--ink-muted)" }}>
          <Activity className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No anomalies detected in this period.</p>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2.5 pr-4 label-meta">MERCADO</th>
                  <th className="text-left py-2.5 pr-4 label-meta">METRICA</th>
                  <th className="text-right py-2.5 pr-4 label-meta">DELTA</th>
                  <th className="text-right py-2.5 pr-4 label-meta">Z-SCORE</th>
                  <th className="text-left py-2.5 label-meta">SEVERIDADE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                    <td className="py-3 pr-4 font-semibold" style={{ color: "var(--ink)" }}>{r.market}</td>
                    <td className="py-3 pr-4" style={{ color: "var(--ink-soft)" }}>{r.label}</td>
                    <td className="py-3 pr-4 text-right font-num" style={{ color: r.delta >= 0 ? "var(--positive)" : "var(--negative)" }}>
                      {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}%
                    </td>
                    <td className="py-3 pr-4 text-right font-num" style={{ color: "var(--ink-muted)" }}>
                      {r.z > 0 ? "+" : ""}{r.z.toFixed(2)}
                    </td>
                    <td className="py-3">
                      <span className="badge" style={{
                        background: Math.abs(r.z) > 2 ? "var(--negative-soft)" : "var(--warning-soft)",
                        color: Math.abs(r.z) > 2 ? "var(--negative)" : "var(--warning)",
                      }}>
                        {Math.abs(r.z) > 2 ? "HIGH" : "MEDIUM"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

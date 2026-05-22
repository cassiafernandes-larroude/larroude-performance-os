import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import { DiagnosticCard } from "@/components/cards/DiagnosticCard";
import type { Period } from "@/types/metric";
import { DiagnosticsFilters } from "@/components/diagnostics/DiagnosticsFilters";

export const revalidate = 300;

export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: { period?: string; severity?: string; market?: string };
}) {
  const period = (searchParams.period || "28d") as Period;
  const severityFilter = searchParams.severity;
  const marketFilter = searchParams.market;

  const [us, br] = await Promise.all([
    getMetricBundle("US", period),
    getMetricBundle("BR", period),
  ]);
  const all = await runDiagnostics({ us, br });

  let filtered = all;
  if (severityFilter) filtered = filtered.filter((d) => d.severity === severityFilter);
  if (marketFilter) filtered = filtered.filter((d) => d.market === marketFilter);

  const counts = {
    critical: all.filter((d) => d.severity === "critical").length,
    warning: all.filter((d) => d.severity === "warning").length,
    positive: all.filter((d) => d.severity === "positive").length,
    info: all.filter((d) => d.severity === "info").length,
  };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>
          Diagnosticos
        </h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Engine de regras cross-source - {all.length} diagnosticos no periodo {period}
        </p>
      </div>

      <DiagnosticsFilters counts={counts} />

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((d) => (
            <DiagnosticCard
              key={d.id}
              severity={d.severity}
              meta={`${d.market} - ${d.category}`}
              title={d.title}
              body={<>{d.body}</>}
              recommendation={d.recommendation}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12" style={{ color: "var(--ink-muted)" }}>
          <p className="text-[14px]">Nenhum diagnostico para os filtros selecionados.</p>
        </div>
      )}
    </div>
  );
}

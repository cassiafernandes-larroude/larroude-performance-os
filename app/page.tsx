import { FiltersBar } from "@/components/filters/FiltersBar";
import { MetricCard } from "@/components/cards/MetricCard";
import { DiagnosticCard } from "@/components/cards/DiagnosticCard";
import { Sparkles } from "lucide-react";
import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import type { Period } from "@/types/metric";

export const dynamic = "force-dynamic";

export default async function DailyBriefingPage({
  searchParams,
}: {
  searchParams: { market?: string; period?: string };
}) {
  const period = (searchParams.period || "28d") as Period;

  const [us, br] = await Promise.all([
    getMetricBundle("US", period),
    getMetricBundle("BR", period),
  ]);
  const diagnostics = await runDiagnostics({ us, br });

  const source = us.metrics[0]?.source ?? "Mock";
  const sourceLabel = source === "BQ" ? "BigQuery Larroude OS" : "Mock data (configure GCP_SA_KEY_BASE64)";

  return (
    <>
      <header
        className="hidden lg:flex px-8 py-3 items-center justify-between"
        style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-muted)" }}>
          <span>Overview</span>
          <span>/</span>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Daily Briefing</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>Sync</span>
          <span className="font-num">{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>-</span>
          <span>{sourceLabel}</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-4 lg:mb-5">
          <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>Daily Briefing</h1>
          <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
            Meta + Google + Shopify + Klaviyo - via {sourceLabel}
          </p>
          <p className="text-[11px] lg:text-[12px] mt-1" style={{ color: "var(--ink-muted)" }}>
            <span className="hidden lg:inline">
              Dados de <strong style={{ color: "var(--ink-soft)" }}>{us.date_range.from} - {us.date_range.to}</strong> -{" "}
            </span>
            Atualizado em {new Date(us.generated_at).toLocaleString("pt-BR")}
          </p>
        </div>

        <FiltersBar />

        {/* US Section */}
        <div className="section-marker mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>🇺🇸 ESTADOS UNIDOS</span>
            <span className="badge" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>USD</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-7 lg:mb-8">
          {us.metrics.slice(0, 8).map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.formatted}
              delta={m.delta_pct != null ? { value: m.delta_label!, positive: m.delta_pct >= 0 } : undefined}
              hint={!m.delta_label ? m.hint : undefined}
            />
          ))}
        </div>

        {/* Diagnósticos */}
        <div className="section-marker mb-3">
          <div className="flex items-baseline gap-2 lg:gap-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>🔬 DIAGNOSTICOS</span>
            <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              {diagnostics.length} insights - cruzando 4 fontes
            </span>
          </div>
        </div>

        {diagnostics.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-7">
            {diagnostics.slice(0, 6).map((d) => (
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
          <div className="card mb-7 text-center py-8" style={{ color: "var(--ink-muted)" }}>
            <p className="text-[13px]">Nenhum diagnóstico crítico no período. ✓</p>
          </div>
        )}

        {/* Narrative placeholder */}
        <div className="card card-prose mb-7" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8FB 100%)", border: "1px solid var(--pink-soft)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" style={{ color: "var(--pink-deep)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--pink-deep)" }}>
              Análise - cross-source
            </span>
          </div>
          <h2 className="font-display text-[18px] lg:text-[22px] mb-3" style={{ color: "var(--ink)" }}>
            Visão consolidada {period}
          </h2>
          <div className="space-y-3 text-[12px] lg:text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            <p>
              <strong style={{ color: "var(--ink)" }}>US:</strong> spend {us.metrics.find(m => m.key === "amount_spent")?.formatted} -
              ROAS {us.metrics.find(m => m.key === "roas_gross")?.formatted} -
              gross sales {us.metrics.find(m => m.key === "gross_sales")?.formatted}.
            </p>
            <p>
              <strong style={{ color: "var(--ink)" }}>BR:</strong> spend {br.metrics.find(m => m.key === "amount_spent")?.formatted} -
              ROAS {br.metrics.find(m => m.key === "roas_gross")?.formatted} -
              gross sales {br.metrics.find(m => m.key === "gross_sales")?.formatted}.
            </p>
            <p style={{ color: "var(--ink-muted)" }}>
              Narrativa via Anthropic ainda inativa - configure ANTHROPIC_API_KEY para análise automática diária.
            </p>
          </div>
        </div>

        {/* BR Section */}
        <div className="section-marker mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>🇧🇷 BRASIL</span>
            <span className="badge" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>BRL</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-8">
          {br.metrics.slice(0, 8).map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.formatted}
              delta={m.delta_pct != null ? { value: m.delta_label!, positive: m.delta_pct >= 0 } : undefined}
              hint={!m.delta_label ? m.hint : undefined}
            />
          ))}
        </div>
      </div>
    </>
  );
}

import { Suspense } from "react";
import { RefreshBar } from "@/components/filters/RefreshBar";
import { MetricCard } from "@/components/cards/MetricCard";
import { DiagnosticCard } from "@/components/cards/DiagnosticCard";
import { NarrativeSection, NarrativeSkeleton } from "@/components/overview/NarrativeSection";
import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import type { Period } from "@/types/metric";

// Overview = D-1 (yesterday) with ISR caching for fast loads.
// Refresh button does router.refresh() to force re-fetch when user wants fresh data.
export const revalidate = 60;

export default async function DailyBriefingPage() {
  // D-1 = yesterday (last completed day). Server timezone -> ISO date.
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const period = "today" as Period; // marker so cache key differs from 28d
  const customRange = { from: yesterday, to: yesterday };

  const [us, br] = await Promise.all([
    getMetricBundle("US", period, customRange),
    getMetricBundle("BR", period, customRange),
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
        <div className="flex items-center gap-2 text-[12px]">
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Overview</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>Sync</span>
          <span className="font-num">{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          <span>-</span>
          <span>{sourceLabel}</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-4 lg:mb-5">
          <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>Overview</h1>
          <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
            Meta + Google + Shopify + Klaviyo - via {sourceLabel}
          </p>
          <p className="text-[11px] lg:text-[12px] mt-1" style={{ color: "var(--ink-muted)" }}>
            <span className="hidden lg:inline">
              Data from <strong style={{ color: "var(--ink-soft)" }}>{us.date_range.from} - {us.date_range.to}</strong> -{" "}
            </span>
            Updated at {new Date(us.generated_at).toLocaleString("en-US")}
          </p>
        </div>

        <RefreshBar />

        {/* ===== US Section ===== */}
        <div className="section-marker mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>🇺🇸 UNITED STATES</span>
            <span className="badge" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>USD</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-5">
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

        {/* ===== BR Section (logo abaixo do US) ===== */}
        <div className="section-marker mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>🇧🇷 BRAZIL</span>
            <span className="badge" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>BRL</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-7 lg:mb-8">
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

        {/* ===== Diagnósticos ===== */}
        <div className="section-marker mb-3">
          <div className="flex items-baseline gap-2 lg:gap-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>🔬 DIAGNOSTICS</span>
            <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              {diagnostics.length} insights - cross-source (4 sources)
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
            <p className="text-[13px]">No critical diagnostics in this period.</p>
          </div>
        )}

        {/* ===== Narrative (Suspense - nao bloqueia render dos cards) ===== */}
        <Suspense fallback={<NarrativeSkeleton />}>
          <NarrativeSection us={us} br={br} diagnostics={diagnostics} period={period} />
        </Suspense>
      </div>
    </>
  );
}

import { Suspense } from "react";
import { RefreshBar } from "@/components/filters/RefreshBar";
import { MetricCard } from "@/components/cards/MetricCard";
import { DiagnosticCard } from "@/components/cards/DiagnosticCard";
import { NarrativeSection, NarrativeSkeleton } from "@/components/overview/NarrativeSection";
import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import type { Period } from "@/types/metric";
import { DashboardActions } from "@/components/shared/DashboardActions";
import { todayInMarket, yesterdayInMarket } from "@/lib/utils/market-tz";

// Cassia 2026-06-12: Overview suporta ?day=today (intra-dia D0) e default
// ?day=yesterday (D-1). Refresh button continua forçando re-fetch.
export const revalidate = 60;

export default async function DailyBriefingPage({
  searchParams,
}: {
  searchParams?: { day?: string };
}) {
  const isToday = searchParams?.day === "today";
  const period = "today" as Period; // marker so cache key differs from 28d

  // Datas resolvidas no fuso do market correspondente (NY p/ US, Brasília p/ BR).
  const usDate = isToday ? todayInMarket("US") : yesterdayInMarket("US");
  const brDate = isToday ? todayInMarket("BR") : yesterdayInMarket("BR");

  const [us, br] = await Promise.all([
    getMetricBundle("US", period, { from: usDate, to: usDate }),
    getMetricBundle("BR", period, { from: brDate, to: brDate }),
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
        <div className="mb-4 lg:mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div>
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
          <DashboardActions />
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

        {/* Cassia 2026-06-14: removido bloco "DIAGNOSTICS · cross-source" e Narrative do Overview */}
      </div>
    </>
  );
}

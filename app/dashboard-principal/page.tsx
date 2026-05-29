import { getMetricBundle } from "@/lib/data/metrics";
import { MetricCard } from "@/components/cards/MetricCard";
import { FiltersBar } from "@/components/filters/FiltersBar";
import { DashboardActions } from "@/components/shared/DashboardActions";
import type { Market, Period } from "@/types/metric";
import { Calendar } from "lucide-react";

// Native Main Dashboard - replaces the external iframe.
// Uses getMetricBundle (same source as Overview) with FiltersBar period/market controls.
export const revalidate = 300;

export default async function DashboardPrincipalPage({
  searchParams,
}: {
  searchParams: { market?: string; period?: string; from?: string; to?: string };
}) {
  const market = (searchParams.market || "US") as Market;
  const period = (searchParams.period || "28d") as Period;
  const customRange = searchParams.from && searchParams.to
    ? { from: searchParams.from, to: searchParams.to }
    : undefined;

  const bundle = await getMetricBundle(market, period, customRange);
  const currency = market === "US" ? "USD" : "BRL";
  const source = bundle.metrics[0]?.source ?? "Mock";
  const sourceLabel = source === "BQ" ? "BigQuery Larroude OS" : "Mock data";

  return (
    <>
      <header
        className="hidden lg:flex px-8 py-3 items-center justify-between"
        style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 text-[12px]">
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Main Dashboard</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>Sync</span>
          <span className="font-num">
            {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
          <span>-</span>
          <span>{sourceLabel}</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>
              Main Dashboard
            </h1>
            <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
              Meta + Google + Shopify + Klaviyo - via {sourceLabel}
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
              <Calendar className="inline w-3 h-3 mr-1" />
              {bundle.date_range.from} to {bundle.date_range.to}
            </p>
          </div>
          <DashboardActions />
        </div>

        <FiltersBar />

        <div className="section-marker mb-3">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ink-muted)" }}
            >
              {market === "US" ? "UNITED STATES" : "BRAZIL"}
            </span>
            <span
              className="badge"
              style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}
            >
              {currency}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-5">
          {bundle.metrics.slice(0, 8).map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.formatted}
              delta={m.delta_pct != null ? { value: m.delta_label!, positive: m.delta_pct >= 0 } : undefined}
              hint={!m.delta_label ? m.hint : undefined}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3 mb-5">
          {bundle.metrics.slice(8).map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.formatted}
              delta={m.delta_pct != null ? { value: m.delta_label!, positive: m.delta_pct >= 0 } : undefined}
              hint={!m.delta_label ? m.hint : undefined}
            />
          ))}
        </div>

        <p className="text-[11px] mt-4" style={{ color: "var(--ink-muted)" }}>
          Updated at {new Date(bundle.generated_at).toLocaleString("en-US")}
        </p>
      </div>
    </>
  );
}

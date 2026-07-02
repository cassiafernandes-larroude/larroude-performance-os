import { Suspense } from "react";
import { RefreshBar } from "@/components/filters/RefreshBar";
import { MetricCard } from "@/components/cards/MetricCard";
import { DiagnosticCard } from "@/components/cards/DiagnosticCard";
import { NarrativeSection, NarrativeSkeleton } from "@/components/overview/NarrativeSection";
import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import type { Period } from "@/types/metric";
import { DashboardActions } from "@/components/shared/DashboardActions";
import { FulfillmentFilter } from "@/components/filters/FulfillmentFilter";
import { parseFulfillmentCategories } from "@/lib/shared/fulfillment-category";
import { todayInMarket, yesterdayInMarket } from "@/lib/utils/market-tz";
import type { MetricBundle } from "@/types/metric";

// Cassia 2026-07-02: linha compacta Pré-Order (spend + ROAS de campanhas pre-order, split já
// calculado na SQL do gold). Só aparece quando há spend pre-order no período — evita exibir
// $0 nos dias em que o BQ gold ainda não processou (lag ~2d no Meta).
function PreorderRow({ bundle }: { bundle: MetricBundle }) {
  const spend = bundle.metrics.find((m) => m.key === "preorder_spend");
  const roas = bundle.metrics.find((m) => m.key === "preorder_roas");
  if (!spend || spend.value <= 0) return null;
  return (
    <div
      className="-mt-3 mb-5 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] lg:text-[12px]"
      style={{ background: "var(--paper)", border: "1px solid var(--border)", color: "var(--ink-soft)" }}
    >
      <span className="font-semibold uppercase tracking-wider text-[10px]" style={{ color: "var(--ink-muted)" }}>
        Pré-Order
      </span>
      <span>
        spend <strong className="font-num" style={{ color: "var(--ink)" }}>{spend.formatted}</strong>
      </span>
      <span>·</span>
      <span>
        ROAS <strong className="font-num" style={{ color: "var(--ink)" }}>{roas?.formatted ?? "—"}</strong>
      </span>
    </div>
  );
}

// Cassia 2026-06-12: Overview suporta ?day=today (intra-dia D0) e default
// ?day=yesterday (D-1). Refresh button continua forçando re-fetch.
export const revalidate = 60;

export default async function DailyBriefingPage({
  searchParams,
}: {
  searchParams?: { day?: string; fulCats?: string };
}) {
  const isToday = searchParams?.day === "today";
  const period = "today" as Period; // marker so cache key differs from 28d
  const fulCats = parseFulfillmentCategories(searchParams?.fulCats);

  // Datas resolvidas no fuso do market correspondente (NY p/ US, Brasília p/ BR).
  const usDate = isToday ? todayInMarket("US") : yesterdayInMarket("US");
  const brDate = isToday ? todayInMarket("BR") : yesterdayInMarket("BR");

  const [us, br] = await Promise.all([
    getMetricBundle("US", period, { from: usDate, to: usDate }, fulCats),
    getMetricBundle("BR", period, { from: brDate, to: brDate }, fulCats),
  ]);
  const diagnostics = await runDiagnostics({ us, br });

  const source = us.metrics[0]?.source ?? "Unavailable";
  // Cassia 2026-06-21: sem dados-mock. Se a fonte nao respondeu, avisamos explicitamente.
  const usUnavailable = (us.metrics[0]?.source ?? "Unavailable") === "Unavailable";
  const brUnavailable = (br.metrics[0]?.source ?? "Unavailable") === "Unavailable";
  const dataUnavailable = usUnavailable || brUnavailable;
  const sourceLabel = source === "BQ" ? "BigQuery Larroude OS" : "fonte indisponível";

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

        {dataUnavailable && (
          <div className="mb-5 rounded-lg px-4 py-3 text-[12px] lg:text-[13px] flex items-start gap-2"
               style={{ background: "rgba(255,92,108,0.10)", border: "1px solid rgba(255,92,108,0.35)", color: "#c0334a" }}>
            <span aria-hidden>⚠</span>
            <span>
              <strong>Dados indisponíveis{usUnavailable && brUnavailable ? "" : usUnavailable ? " (US)" : " (BR)"}.</strong>{" "}
              A fonte (BigQuery) não respondeu — os números exibidos como zero <strong>não são reais</strong>. Verifique a conexão/credenciais e atualize. Nenhum valor foi estimado.
            </span>
          </div>
        )}

        <FulfillmentFilter className="mb-5" />

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
        <PreorderRow bundle={us} />

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
        <PreorderRow bundle={br} />

        {/* Cassia 2026-06-14: removido bloco "DIAGNOSTICS · cross-source" e Narrative do Overview */}
      </div>
    </>
  );
}

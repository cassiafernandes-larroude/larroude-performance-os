import { getExecutiveBundle } from "@/lib/data/executive";
import { formatCurrency, formatMultiplier, formatNumber, formatPercent } from "@/lib/utils/format";
import { TrendingDown, TrendingUp, DollarSign, Clock, Target, Activity } from "lucide-react";
import { DashboardActions } from "@/components/shared/DashboardActions";

export const revalidate = 300;

export default async function ExecutivePage() {
  const [us, br] = await Promise.all([
    getExecutiveBundle("US"),
    getExecutiveBundle("BR"),
  ]);

  return (
    <>
      <header
        className="hidden lg:flex px-8 py-3 items-center justify-between"
        style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 text-[12px]">
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Executive View - Financial Health</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>BigQuery Larroude OS - 28d</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>Executive View</h1>
            <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
              Financial health - margin, burn rate, payback period, channel efficiency
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
              Period: {us.period.from} a {us.period.to} - {us.source === "BQ" ? "BigQuery Larroude OS" : "Mock data"}
            </p>
          </div>
          <DashboardActions />
        </div>

        <ExecutiveMarketSection bundle={us} flag="🇺🇸" label="ESTADOS UNIDOS" currency="USD" />

        <div className="mt-10">
          <ExecutiveMarketSection bundle={br} flag="🇧🇷" label="BRASIL" currency="BRL" />
        </div>
      </div>
    </>
  );
}

function ExecutiveMarketSection({ bundle, flag, label, currency }: {
  bundle: Awaited<ReturnType<typeof getExecutiveBundle>>;
  flag: string;
  label: string;
  currency: "USD" | "BRL";
}) {
  // Health indicators
  const marginHealth = bundle.contribution_margin_pct >= 50 ? "positive" : bundle.contribution_margin_pct >= 30 ? "warning" : "negative";
  const burnHealth = bundle.burn_rate_pct <= 40 ? "positive" : bundle.burn_rate_pct <= 60 ? "warning" : "negative";
  const paybackHealth = bundle.payback_period_months <= 6 ? "positive" : bundle.payback_period_months <= 12 ? "warning" : "negative";
  const effHealth = bundle.marketing_efficiency >= 3 ? "positive" : bundle.marketing_efficiency >= 1.5 ? "warning" : "negative";

  const colorMap = { positive: "var(--positive)", warning: "var(--warning)", negative: "var(--negative)" };
  const bgMap = { positive: "var(--positive-soft)", warning: "var(--warning-soft)", negative: "var(--negative-soft)" };

  return (
    <>
      <div className="section-marker mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>{flag} {label}</span>
          <span className="badge" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>{currency}</span>
        </div>
      </div>

      {/* 4 Financial Health KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <HealthCard
          icon={<DollarSign className="w-5 h-5" />}
          tag="MARGIN (PROXY)"
          value={`${bundle.contribution_margin_pct.toFixed(1)}%`}
          sub={`${formatCurrency(bundle.contribution_margin, currency)}`}
          health={marginHealth}
          colorMap={colorMap} bgMap={bgMap}
          hint="Net Rev - Ad Spend"
        />
        <HealthCard
          icon={<Activity className="w-5 h-5" />}
          tag="BURN RATE"
          value={`${bundle.burn_rate_pct.toFixed(1)}%`}
          sub={`Ad Spend / Net Rev`}
          health={burnHealth}
          colorMap={colorMap} bgMap={bgMap}
          hint={burnHealth === "positive" ? "Healthy <40%" : burnHealth === "warning" ? "Warning 40-60%" : "Critical >60%"}
        />
        <HealthCard
          icon={<Clock className="w-5 h-5" />}
          tag="PAYBACK"
          value={`${bundle.payback_period_months.toFixed(1)}m`}
          sub={`CAC ${formatCurrency(bundle.cac, currency, false)} / monthly LTV`}
          health={paybackHealth}
          colorMap={colorMap} bgMap={bgMap}
          hint={paybackHealth === "positive" ? "<6m" : paybackHealth === "warning" ? "6-12m" : ">12m"}
        />
        <HealthCard
          icon={<Target className="w-5 h-5" />}
          tag="MKT EFFICIENCY"
          value={`${bundle.marketing_efficiency.toFixed(2)}x`}
          sub={`Net Rev / Ad Spend`}
          health={effHealth}
          colorMap={colorMap} bgMap={bgMap}
          hint={effHealth === "positive" ? "Healthy >=3x" : effHealth === "warning" ? "Warning 1.5-3x" : "Critical <1.5x"}
        />
      </div>

      {/* Eficiência por canal */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[15px]" style={{ color: "var(--ink)" }}>Revenue by channel (28d)</h3>
          <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
            Top {bundle.channels.length} channels
          </span>
        </div>
        {bundle.channels.length > 0 ? (
          <div className="space-y-2">
            {bundle.channels.map((c) => (
              <div key={c.channel} className="flex items-center gap-3">
                <div className="w-32 lg:w-40 text-[12px] truncate" style={{ color: "var(--ink-soft)" }}>
                  {c.channel}
                </div>
                <div className="flex-1 h-7 rounded relative" style={{ background: "var(--paper)" }}>
                  <div
                    className="h-full rounded flex items-center justify-end px-2"
                    style={{
                      width: `${Math.min(100, c.share_pct)}%`,
                      background: c.channel.includes("Meta") ? "var(--meta-bg)"
                        : c.channel.includes("Google") ? "var(--google-bg)"
                        : c.channel.includes("Klaviyo") ? "var(--klaviyo-bg)"
                        : "var(--pink-soft)",
                    }}
                  >
                    <span className="text-[10px] font-num font-semibold whitespace-nowrap" style={{ color: "var(--ink)" }}>
                      {c.share_pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-24 lg:w-28 text-right text-[12px] font-num" style={{ color: "var(--ink)" }}>
                  {formatCurrency(c.revenue, currency)}
                </div>
                <div className="w-16 text-right text-[11px] font-num" style={{ color: "var(--ink-muted)" }}>
                  {formatNumber(c.orders)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-center py-4" style={{ color: "var(--ink-muted)" }}>
            No channel data available.
          </p>
        )}
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat label="Net Revenue" value={formatCurrency(bundle.net_revenue, currency)} />
        <SummaryStat label="Gross Revenue" value={formatCurrency(bundle.gross_revenue, currency)} />
        <SummaryStat label="Ad Spend" value={formatCurrency(bundle.ad_spend, currency)} />
        <SummaryStat label="Contribution Margin" value={formatCurrency(bundle.contribution_margin, currency)} />
      </div>
    </>
  );
}

function HealthCard({ icon, tag, value, sub, health, colorMap, bgMap, hint }: {
  icon: React.ReactNode;
  tag: string;
  value: string;
  sub: string;
  health: "positive" | "warning" | "negative";
  colorMap: Record<string, string>;
  bgMap: Record<string, string>;
  hint: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: bgMap[health], color: colorMap[health] }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="label-meta">{tag}</div>
          <div className="font-num text-[22px] lg:text-[24px] font-bold mt-0.5" style={{ color: colorMap[health] }}>
            {value}
          </div>
        </div>
      </div>
      <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{sub}</div>
      <div className="text-[10px] italic mt-1" style={{ color: "var(--ink-muted)" }}>{hint}</div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="label-meta mb-1">{label}</div>
      <div className="font-num text-[16px] lg:text-[18px] font-bold" style={{ color: "var(--ink)" }}>{value}</div>
    </div>
  );
}

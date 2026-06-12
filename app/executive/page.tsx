import { getExecutiveConsolidated, type ExecutivePeriod } from "@/lib/data/executive";
import { formatCurrency, formatMultiplier, formatNumber, formatPercent } from "@/lib/utils/format";
import { TrendingDown, TrendingUp, DollarSign, Target } from "lucide-react";
import { DashboardActions } from "@/components/shared/DashboardActions";
import DailyBarChart from "@/components/main-dashboard/DailyBarChart";
import ExecutiveFilterBar from "@/components/executive/ExecutiveFilterBar";
import { yesterdayInMarket } from "@/lib/utils/market-tz";

export const revalidate = 300;

const VALID_PERIODS: ExecutivePeriod[] = ["7d", "14d", "28d", "3M", "6M", "12M"];

export default async function ExecutivePage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string };
}) {
  const periodParam = searchParams?.period as ExecutivePeriod | undefined;
  const period: ExecutivePeriod = periodParam && VALID_PERIODS.includes(periodParam) ? periodParam : "28d";
  const customRange = searchParams?.from && searchParams?.to
    ? { from: searchParams.from, to: searchParams.to }
    : undefined;
  const c = await getExecutiveConsolidated(period, customRange);
  // maxDate p/ date picker = ontem em NY (US é o market âncora)
  const maxDate = yesterdayInMarket("US");

  const profitTone = c.profit >= 0 ? "positive" : "negative";
  const roasTone = c.roas >= 3 ? "positive" : c.roas >= 1.5 ? "warning" : "negative";
  const colorMap = { positive: "var(--positive)", warning: "var(--warning)", negative: "var(--negative)" };
  const bgMap = { positive: "var(--positive-soft)", warning: "var(--warning-soft)", negative: "var(--negative-soft)" };

  return (
    <>
      <header
        className="hidden lg:flex px-8 py-3 items-center justify-between"
        style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 text-[12px]">
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Consolidated View · US + BR in USD</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>BigQuery Larroude OS · 28d</span>
          <span>·</span>
          <span>FX 1 USD = {(1 / c.fxBrlUsd).toFixed(2)} BRL</span>
        </div>
      </header>

      <div className="main-dashboard-root px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>Consolidated View</h1>
              <span
                className="badge"
                style={{
                  background: "var(--pink-soft)",
                  color: "var(--pink-deep)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                }}
              >
                ALL VALUES IN USD
              </span>
            </div>
            <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
              Consolidated financial health — US + BR converted to USD (FX 1 USD = {(1 / c.fxBrlUsd).toFixed(2)} BRL)
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
              Period: {c.period.from} → {c.period.to} · {c.source === "BQ" ? "BigQuery Larroude OS" : "Mock data"}
            </p>
          </div>
          <DashboardActions />
        </div>

        {/* Cassia 2026-06-12: filtro de periodo igual Main Dashboard */}
        <ExecutiveFilterBar maxDate={maxDate} />

        {/* ===== 4 Hero KPIs Consolidados ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <HealthCard
            icon={<DollarSign className="w-5 h-5" />}
            tag="TOTAL INVESTMENT"
            value={formatCurrency(c.total_ad_spend, "USD")}
            sub={`Meta ${formatCurrency(c.total_meta_spend, "USD", false)} · Google ${formatCurrency(c.total_google_spend, "USD", false)}`}
            color="var(--ink)" bg="var(--paper)"
            hint="US + BR ads consolidated"
          />
          <HealthCard
            icon={<TrendingUp className="w-5 h-5" />}
            tag="TOTAL REVENUE"
            value={formatCurrency(c.total_revenue, "USD")}
            sub={`Gross ${formatCurrency(c.total_gross_revenue, "USD", false)}`}
            color={colorMap.positive} bg={bgMap.positive}
            hint="Net Sales (Order Rev − Returns)"
          />
          <HealthCard
            icon={<Target className="w-5 h-5" />}
            tag="ROAS (TOTAL SALES)"
            value={`${c.roas.toFixed(2)}x`}
            sub="Total Sales / Investment"
            color={colorMap[roasTone]} bg={bgMap[roasTone]}
            hint={roasTone === "positive" ? "Healthy ≥3x" : roasTone === "warning" ? "Warning 1.5-3x" : "Critical <1.5x"}
          />
          <HealthCard
            icon={c.profit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            tag="REVENUE − INVESTMENT"
            value={formatCurrency(c.profit, "USD")}
            sub={`${c.profit_margin_pct.toFixed(1)}% margin`}
            color={colorMap[profitTone]} bg={bgMap[profitTone]}
            hint="What's left after paying ads"
          />
        </div>

        {/* ===== Daily charts (mesmo formato Main Dashboard) ===== */}
        <div className="section-marker mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
            DAILY EVOLUTION (28D) · CONSOLIDATED USD
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <div className="card p-4">
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>Total Revenue / day</div>
            <DailyBarChart
              title=""
              data={c.daily.total_sales}
              color="#10b981"
              unit="currency"
              market="US"
              showLabels={false}
              height={220}
            />
          </div>
          <div className="card p-4">
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>Ad Investment / day</div>
            <DailyBarChart
              title=""
              data={c.daily.spend}
              color="#ec4899"
              unit="currency"
              market="US"
              showLabels={false}
              height={220}
            />
          </div>
          <div className="card p-4">
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>ROAS / day</div>
            <DailyBarChart
              title=""
              data={c.daily.roas_total}
              color="#5d4ec5"
              unit="multiple"
              market="US"
              showLabels={false}
              height={220}
            />
          </div>
          <div className="card p-4">
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>Revenue − Investment / day</div>
            <DailyBarChart
              title=""
              data={c.daily.margin_total_sales}
              color="#d97757"
              unit="currency"
              market="US"
              showLabels={false}
              height={220}
            />
          </div>
        </div>

        {/* ===== Channel share consolidado ===== */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px]" style={{ color: "var(--ink)" }}>Revenue share by channel (28d · consolidated)</h3>
            <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              {c.channels.length} channels · BR converted at {(1 / c.fxBrlUsd).toFixed(2)} BRL/USD
            </span>
          </div>
          {c.channels.length > 0 ? (
            <div className="space-y-2">
              {c.channels.map((ch) => (
                <div key={ch.channel} className="flex items-center gap-3">
                  <div className="w-32 lg:w-40 text-[12px] truncate" style={{ color: "var(--ink-soft)" }}>
                    {ch.channel}
                  </div>
                  <div className="flex-1 h-7 rounded relative" style={{ background: "var(--paper)" }}>
                    <div
                      className="h-full rounded flex items-center justify-end px-2"
                      style={{
                        width: `${Math.min(100, ch.share_pct)}%`,
                        background: ch.channel.includes("Meta") ? "var(--meta-bg)"
                          : ch.channel.includes("Google") ? "var(--google-bg)"
                          : ch.channel.includes("Klaviyo") ? "var(--klaviyo-bg)"
                          : "var(--pink-soft)",
                      }}
                    >
                      <span className="text-[10px] font-num font-semibold whitespace-nowrap" style={{ color: "var(--ink)" }}>
                        {ch.share_pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-28 lg:w-32 text-right text-[12px] font-num" style={{ color: "var(--ink)" }}>
                    {formatCurrency(ch.revenue, "USD")}
                  </div>
                  <div className="w-16 text-right text-[11px] font-num" style={{ color: "var(--ink-muted)" }}>
                    {formatNumber(ch.orders)}
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

        {/* ===== Breakdown por market (referência) ===== */}
        <div className="section-marker mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
            BREAKDOWN BY MARKET (USD)
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <MarketCard flag="🇺🇸" label="United States" data={c.by_market.US} native="USD" totalRev={c.total_revenue} totalSpend={c.total_ad_spend} />
          <MarketCard flag="🇧🇷" label="Brazil" data={c.by_market.BR} native="BRL" totalRev={c.total_revenue} totalSpend={c.total_ad_spend} brData={c.by_market.BR} />
        </div>
      </div>
    </>
  );
}

function HealthCard({ icon, tag, value, sub, color, bg, hint }: {
  icon: React.ReactNode;
  tag: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
  hint: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: bg, color }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="label-meta">{tag}</div>
          <div className="font-num text-[20px] lg:text-[22px] font-bold mt-0.5" style={{ color }}>
            {value}
          </div>
        </div>
      </div>
      <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{sub}</div>
      <div className="text-[10px] italic mt-1" style={{ color: "var(--ink-muted)" }}>{hint}</div>
    </div>
  );
}

function MarketCard({ flag, label, data, native, totalRev, totalSpend, brData }: {
  flag: string;
  label: string;
  data: { revenue: number; spend: number; meta: number; google: number };
  native: "USD" | "BRL";
  totalRev: number;
  totalSpend: number;
  brData?: { revenue_brl: number; spend_brl: number };
}) {
  const revShare = totalRev > 0 ? (data.revenue / totalRev) * 100 : 0;
  const spendShare = totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0;
  const roas = data.spend > 0 ? data.revenue / data.spend : 0;
  const profit = data.revenue - data.spend;
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[18px]">{flag}</span>
        <span className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>{label}</span>
        <span className="badge ml-auto" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>USD</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label-meta">Revenue</div>
          <div className="font-num text-[16px] font-bold" style={{ color: "var(--positive)" }}>{formatCurrency(data.revenue, "USD")}</div>
          <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>{revShare.toFixed(1)}% of total</div>
        </div>
        <div>
          <div className="label-meta">Investment</div>
          <div className="font-num text-[16px] font-bold" style={{ color: "var(--ink)" }}>{formatCurrency(data.spend, "USD")}</div>
          <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>{spendShare.toFixed(1)}% of total</div>
        </div>
        <div>
          <div className="label-meta">ROAS</div>
          <div className="font-num text-[16px] font-bold" style={{ color: "var(--ink)" }}>{roas.toFixed(2)}x</div>
        </div>
        <div>
          <div className="label-meta">Revenue − Investment</div>
          <div className="font-num text-[16px] font-bold" style={{ color: profit >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {formatCurrency(profit, "USD")}
          </div>
        </div>
      </div>
    </div>
  );
}

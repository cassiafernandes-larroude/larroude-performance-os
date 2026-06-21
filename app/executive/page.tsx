import { getExecutiveConsolidated, type ExecutivePeriod } from "@/lib/data/executive";
import { computeExecutiveDiagnostics } from "@/lib/data/executive-diagnostics";
import { formatCurrency, formatMultiplier, formatNumber, formatPercent } from "@/lib/utils/format";
import { TrendingDown, TrendingUp, DollarSign, Target } from "lucide-react";
import { DashboardActions } from "@/components/shared/DashboardActions";
import DailyBarChart from "@/components/main-dashboard/DailyBarChart";
import ExecutiveFilterBar from "@/components/executive/ExecutiveFilterBar";
import DiagnosticsPanel from "@/components/executive/DiagnosticsPanel";
import { FulfillmentFilter } from "@/components/filters/FulfillmentFilter";
import { parseFulfillmentCategories } from "@/lib/shared/fulfillment-category";
import { yesterdayInMarket } from "@/lib/utils/market-tz";

// Cassia 2026-06-12: dynamic p/ filtro de periodo reagir imediatamente (sem ISR stale).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_PERIODS: ExecutivePeriod[] = ["1d", "7d", "14d", "28d", "3M", "6M", "12M"];

export default async function ExecutivePage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string; fulCats?: string };
}) {
  const periodParam = searchParams?.period as ExecutivePeriod | undefined;
  const period: ExecutivePeriod = periodParam && VALID_PERIODS.includes(periodParam) ? periodParam : "28d";
  const customRange = searchParams?.from && searchParams?.to
    ? { from: searchParams.from, to: searchParams.to }
    : undefined;
  const fulCats = parseFulfillmentCategories(searchParams?.fulCats);
  const c = await getExecutiveConsolidated(period, customRange, fulCats);
  const diagnostics = computeExecutiveDiagnostics(c);
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
              Active range: <strong style={{ color: "var(--ink-soft)" }}>{c.period.from} → {c.period.to}</strong>
              {" · "}{customRange ? `custom (${searchParams?.from}-${searchParams?.to})` : `preset ${period.toUpperCase()}`}
              {" · "}{c.source === "BQ" ? "BigQuery Larroude OS" : "Mock data"}
            </p>
          </div>
          <DashboardActions />
        </div>

        {/* Cassia 2026-06-12: filtro de periodo igual Main Dashboard */}
        <ExecutiveFilterBar maxDate={maxDate} />

        {/* Cassia 2026-06-17: filtro de origem (mantem a visao atual, so' filtra por origem) */}
        <FulfillmentFilter className="mt-2 mb-4" />
        {fulCats && fulCats.length > 0 && (
          <p className="text-[11px] mb-4" style={{ color: "var(--ink-muted)" }}>
            KPIs, ROAS e gráficos diários consolidados por origem · channel share = total
          </p>
        )}

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

        {/* ===== Cassia 2026-06-14: 3 KPIs DTC complementares (Gross / ROAS Gross / Units) ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <HealthCard
            icon={<DollarSign className="w-5 h-5" />}
            tag="GROSS SALES (DTC)"
            value={formatCurrency(c.total_gross_revenue, "USD")}
            sub={`Net ${formatCurrency(c.total_revenue, "USD", false)}`}
            color="var(--ink)" bg="var(--paper)"
            hint="Gross Sales US + BR (exclui B2B e PIX não-pago)"
          />
          <HealthCard
            icon={<Target className="w-5 h-5" />}
            tag="ROAS (GROSS SALES)"
            value={`${c.roas_gross.toFixed(2)}x`}
            sub="Gross Sales / Investment"
            color="var(--ink)" bg="var(--paper)"
            hint="ROAS sobre Gross Sales (DTC)"
          />
          <HealthCard
            icon={<TrendingUp className="w-5 h-5" />}
            tag="UNITS SOLD (DTC)"
            value={formatNumber(c.total_units)}
            sub={`US + BR · ${c.total_revenue > 0 ? formatCurrency(c.total_revenue / Math.max(1, c.total_units), "USD", false) : "—"} / unit`}
            color="var(--ink)" bg="var(--paper)"
            hint="Total de unidades vendidas (exclui B2B)"
          />
        </div>

        {/* ===== Cause & Effect Diagnostics ===== */}
        <DiagnosticsPanel diagnostics={diagnostics} />

        {/* ===== Daily charts (mesmo formato Main Dashboard) ===== */}
        <div className="section-marker mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
            DAILY EVOLUTION (28D) · CONSOLIDATED USD
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <div className="card p-4">
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>Total Revenue</div>
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
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>Ad Investment</div>
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
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>ROAS</div>
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
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ink)" }}>Revenue − Investment</div>
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

        {/* Cassia 2026-06-14: ===== BY MARKET — uma única seção (PROFIT + BREAKDOWN unificados) =====
            Investment Total = TODOS os canais (Meta+Google+Tools+%rev) — alinhado com Main Dashboard.
            Profit Op = Revenue − Investment Total.
            Profit UE = aproximação operacional (regras Unit Economics): Revenue − COGS − Tax − Card/PIX − Investment − Frete×units. */}
        <div className="section-marker mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
            💰 BY MARKET (USD)
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <MarketCard flag="🇺🇸" label="United States" data={c.by_market.US} native="USD" totalRev={c.total_revenue} totalSpend={c.total_ad_spend} />
          <MarketCard flag="🇧🇷" label="Brazil" data={c.by_market.BR} native="BRL" totalRev={c.total_revenue} totalSpend={c.total_ad_spend} brData={c.by_market.BR} />
        </div>
        <div className="text-[10px] mb-6 px-3 py-2 rounded" style={{ background: "var(--paper)", color: "var(--ink-muted)" }}>
          <strong style={{ color: "var(--ink-soft)" }}>How to read:</strong> Investment Total inclui Meta + Google + Tools (Klaviyo, Attentive, Criteo, Agent.shop, Awin, ShopMy), igual ao Dashboard Principal.
          {" "}<strong style={{ color: "var(--ink-soft)" }}>Profit Op</strong> = Revenue − Investment Total.
          {" "}<strong style={{ color: "var(--ink-soft)" }}>Profit UE</strong> ≈ aplicação das regras do Unit Economics no agregado (COGS 30%, Tax 8% US / 12% BR, Card 3.5%, PIX 5%, Frete/unit). Veja UE para análise por produto.
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

// Cassia 2026-06-14: card unificado por mercado.
// Investment Total = TODOS canais (Meta + Google + Tools + %rev), igual ao Main Dashboard.
// Profit Op = Receita − Investimento Total.
// Profit UE ≈ regras Unit Economics aplicadas no agregado (COGS+Tax+Card+PIX+Frete).
function MarketCard({ flag, label, data, native, totalRev, totalSpend }: {
  flag: string;
  label: string;
  data: {
    revenue: number;
    spend: number;
    meta: number;
    google: number;
    tools: number;
    percent_rev: number;
    units: number;
    profit: number;
    profit_margin_pct: number;
    ue_profit: number;
    ue_margin_pct: number;
    byChannel: Record<string, number>;
    revenue_brl?: number;
    spend_brl?: number;
    profit_brl?: number;
  };
  native: "USD" | "BRL";
  totalRev: number;
  totalSpend: number;
  brData?: { revenue_brl: number; spend_brl: number };
}) {
  const revShare = totalRev > 0 ? (data.revenue / totalRev) * 100 : 0;
  const spendShare = totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0;
  const roas = data.spend > 0 ? data.revenue / data.spend : 0;
  const profitOp = data.profit;
  const profitUe = data.ue_profit;
  const profitColor = profitOp >= 0 ? "var(--positive)" : "var(--negative)";
  const profitBg = profitOp >= 0 ? "rgba(13, 148, 136, 0.08)" : "rgba(220, 38, 38, 0.08)";
  const ueColor = profitUe >= 0 ? "var(--positive)" : "var(--negative)";

  return (
    <div className="card" style={{ borderTop: `3px solid ${profitColor}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[22px]">{flag}</span>
        <span className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>{label}</span>
        <span className="badge ml-auto" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>USD</span>
      </div>

      {/* PROFIT OP destaque */}
      <div style={{ background: profitBg, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
        <div className="label-meta" style={{ color: profitColor }}>PROFIT OP (Revenue − Investment Total)</div>
        <div className="font-num text-[24px] lg:text-[26px] font-bold mt-1" style={{ color: profitColor, lineHeight: 1.0 }}>
          {formatCurrency(profitOp, "USD")}
        </div>
        {native === "BRL" && data.profit_brl != null && (
          <div className="text-[10px] mt-1" style={{ color: "var(--ink-muted)" }}>
            native: R$ {Math.round(data.profit_brl).toLocaleString("pt-BR")}
          </div>
        )}
        <div className="text-[11px] mt-1" style={{ color: "var(--ink-soft)" }}>
          <b style={{ color: profitColor }}>{data.profit_margin_pct.toFixed(1)}%</b> margin
        </div>
      </div>

      {/* PROFIT UE (Unit Economics rules) */}
      <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-md" style={{ background: "var(--paper)", border: `1px solid ${ueColor === 'var(--positive)' ? 'rgba(13,148,136,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Profit UE (estimate)</div>
          <div className="text-[9px]" style={{ color: "var(--ink-muted)" }}>− COGS 30% − Tax − Card/PIX − Frete</div>
        </div>
        <div className="text-right">
          <div className="font-num text-[15px] font-bold" style={{ color: ueColor }}>{formatCurrency(profitUe, "USD")}</div>
          <div className="text-[10px]" style={{ color: ueColor }}>{data.ue_margin_pct.toFixed(1)}% margin</div>
        </div>
      </div>

      {/* Revenue + Investment Total */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="label-meta">Revenue</div>
          <div className="font-num text-[15px] font-bold" style={{ color: "var(--positive)" }}>{formatCurrency(data.revenue, "USD")}</div>
          <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>{revShare.toFixed(1)}% of total</div>
          {native === "BRL" && data.revenue_brl != null && (
            <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>R$ {Math.round(data.revenue_brl).toLocaleString("pt-BR")}</div>
          )}
        </div>
        <div>
          <div className="label-meta">Investment Total (all channels)</div>
          <div className="font-num text-[15px] font-bold" style={{ color: "var(--ink)" }}>{formatCurrency(data.spend, "USD")}</div>
          <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>{spendShare.toFixed(1)}% of total · ROAS {roas.toFixed(2)}x</div>
          {native === "BRL" && data.spend_brl != null && (
            <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>R$ {Math.round(data.spend_brl).toLocaleString("pt-BR")}</div>
          )}
        </div>
      </div>

      {/* Investment breakdown POR CANAL (Cassia 2026-06-14: Meta, Google, Klaviyo, Criteo, Attentive, Agent.shop, Awin, ShopMy) */}
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--ink-muted)" }}>Investment breakdown (per channel)</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {Object.entries(data.byChannel)
          .filter(([, v]) => v > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([channel, value]) => (
            <div key={channel} className="flex justify-between border-b pb-0.5" style={{ borderColor: "var(--border)" }}>
              <span>{channel}</span>
              <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>{formatCurrency(value, "USD", false)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// Cassia 2026-06-14: card grande de PROFIT por país com receita, investimento, lucro, margem e share do lucro total
function ProfitCountryCard({
  flag,
  label,
  revenue,
  spend,
  profit,
  profitMarginPct,
  profitShare,
  native,
  profitNative,
  revenueNative,
  spendNative,
}: {
  flag: string;
  label: string;
  revenue: number;
  spend: number;
  profit: number;
  profitMarginPct: number;
  profitShare: number;
  native: "USD" | "BRL";
  profitNative: number;
  revenueNative?: number;
  spendNative?: number;
}) {
  const profitColor = profit >= 0 ? "var(--positive)" : "var(--negative)";
  const profitBg = profit >= 0 ? "rgba(13, 148, 136, 0.08)" : "rgba(220, 38, 38, 0.08)";
  return (
    <div className="card" style={{ borderTop: `3px solid ${profitColor}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[22px]">{flag}</span>
        <div className="flex-1">
          <div className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>{label}</div>
          <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>Profit = Revenue − Total Spend</div>
        </div>
        <span className="badge" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>USD</span>
      </div>

      {/* PROFIT em destaque */}
      <div style={{ background: profitBg, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <div className="label-meta" style={{ color: profitColor }}>PROFIT</div>
        <div className="font-num text-[28px] lg:text-[32px] font-bold mt-1" style={{ color: profitColor, lineHeight: 1.0 }}>
          {formatCurrency(profit, "USD")}
        </div>
        {native === "BRL" && profitNative !== profit && (
          <div className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
            native: R$ {Math.round(profitNative).toLocaleString("pt-BR")}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: "var(--ink-soft)" }}>
          <span><b style={{ color: profitColor }}>{profitMarginPct.toFixed(1)}%</b> margin</span>
          <span>·</span>
          <span><b style={{ color: profitColor }}>{profitShare.toFixed(0)}%</b> of total profit</span>
        </div>
      </div>

      {/* Revenue / Spend breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label-meta">Revenue</div>
          <div className="font-num text-[15px] font-bold" style={{ color: "var(--positive)" }}>
            {formatCurrency(revenue, "USD")}
          </div>
          {revenueNative != null && (
            <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
              R$ {Math.round(revenueNative).toLocaleString("pt-BR")}
            </div>
          )}
        </div>
        <div>
          <div className="label-meta">Total Spend</div>
          <div className="font-num text-[15px] font-bold" style={{ color: "var(--ink)" }}>
            {formatCurrency(spend, "USD")}
          </div>
          {spendNative != null && (
            <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
              R$ {Math.round(spendNative).toLocaleString("pt-BR")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { getNorthStarBundle } from "@/lib/data/northstar";
import { formatCurrency, formatNumber, formatMultiplier, formatPercent } from "@/lib/utils/format";
import { Sparkles, TrendingUp, Users, Repeat, Coins } from "lucide-react";
import { DashboardActions } from "@/components/shared/DashboardActions";

export const revalidate = 300;

export default async function NorthStarPage() {
  const [us, br] = await Promise.all([
    getNorthStarBundle("US"),
    getNorthStarBundle("BR"),
  ]);

  return (
    <>
      <header
        className="hidden lg:flex px-8 py-3 items-center justify-between"
        style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 text-[12px]">
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>North Star</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>Sync</span>
          <span className="font-num">{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          <span>-</span>
          <span>BigQuery Larroude OS - 12-month window</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>North Star</h1>
            <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
              4 anchor metrics for Larroude - same logic as the official LTV Dashboard
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
              Window: {us.period.from} to {us.period.to} - {us.source === "BQ" ? "BigQuery Larroude OS" : "Mock"}
            </p>
          </div>
          <DashboardActions />
        </div>

        {/* US */}
        <MarketSection bundle={us} flag="🇺🇸" label="UNITED STATES" currency="USD" />

        {/* BR */}
        <div className="mt-10">
          <MarketSection bundle={br} flag="🇧🇷" label="BRAZIL" currency="BRL" />
        </div>
      </div>
    </>
  );
}

function MarketSection({ bundle, flag, label, currency }: {
  bundle: Awaited<ReturnType<typeof getNorthStarBundle>>;
  flag: string;
  label: string;
  currency: "USD" | "BRL";
}) {
  const ratio = bundle.ltv_cac;
  const ratioBadge = ratio >= 3 ? "positive" : ratio >= 1.5 ? "warning" : "negative";
  const ratioColor = ratioBadge === "positive" ? "var(--positive)" : ratioBadge === "warning" ? "var(--warning)" : "var(--negative)";
  const ratioSoft = ratioBadge === "positive" ? "var(--positive-soft)" : ratioBadge === "warning" ? "var(--warning-soft)" : "var(--negative-soft)";

  return (
    <>
      <div className="section-marker mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>{flag} {label}</span>
          <span className="badge" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>{currency}</span>
        </div>
      </div>

      {/* 4 North Star Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 1. LTV Preditivo */}
        <NorthStarCard
          icon={<TrendingUp className="w-5 h-5" />}
          tag="PREDICTIVE LTV"
          title="Lifetime Value"
          value={formatCurrency(bundle.ltv_predictive, currency, false)}
          subtitle="Estimated average revenue per customer (12m)"
          drivers={[
            { label: "AOV", value: formatCurrency(bundle.aov, currency, false) },
            { label: "Frequency", value: `${bundle.purchase_frequency.toFixed(2)}x/year` },
            { label: "Lifetime", value: `${bundle.customer_lifetime.toFixed(2)}x` },
          ]}
          formula="AOV × Frequency × Lifetime"
        />

        {/* 2. LTV:CAC */}
        <NorthStarCard
          icon={<Coins className="w-5 h-5" />}
          tag="LTV : CAC"
          title="Acquisition Efficiency"
          value={formatMultiplier(bundle.ltv_cac)}
          subtitle={ratio >= 3 ? "Healthy" : ratio >= 1.5 ? "Warning" : "Critical"}
          highlight={ratioColor}
          highlightBg={ratioSoft}
          drivers={[
            { label: "LTV", value: formatCurrency(bundle.ltv_predictive, currency, false) },
            { label: "CAC", value: formatCurrency(bundle.cac, currency, false) },
            { label: "New customers", value: formatNumber(bundle.new_customers) },
          ]}
          formula="LTV / CAC (healthy >= 3:1)"
        />

        {/* 3. Returning Customer Rate */}
        <NorthStarCard
          icon={<Repeat className="w-5 h-5" />}
          tag="RETURNING RATE"
          title="Repurchase Rate (12m)"
          value={`${bundle.returning_rate.toFixed(1)}%`}
          subtitle="% of customers who came back to purchase"
          drivers={[
            { label: "Total customers", value: formatNumber(bundle.total_customers) },
            { label: "Returned", value: formatNumber(bundle.returning_customers) },
            { label: "Only 1 purchase", value: formatNumber(bundle.total_customers - bundle.returning_customers) },
          ]}
          formula="customers with >=2 orders / total"
        />

        {/* 4. Net Revenue total */}
        <NorthStarCard
          icon={<Users className="w-5 h-5" />}
          tag="NET REVENUE 12M"
          title="Net Revenue"
          value={formatCurrency(bundle.total_net_sales, currency)}
          subtitle="Gross - discounts - refunds"
          drivers={[
            { label: "Historical LTV", value: formatCurrency(bundle.ltv_historical, currency, false) },
            { label: "Total spend", value: formatCurrency(bundle.total_ad_spend, currency) },
            { label: "Net : Spend", value: bundle.total_ad_spend > 0 ? formatMultiplier(bundle.total_net_sales / bundle.total_ad_spend) : "-" },
          ]}
          formula="net_sales = gross - discounts - refunds"
        />
      </div>
    </>
  );
}

function NorthStarCard({ icon, tag, title, value, subtitle, drivers, formula, highlight, highlightBg }: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  value: string;
  subtitle: string;
  drivers: Array<{ label: string; value: string }>;
  formula: string;
  highlight?: string;
  highlightBg?: string;
}) {
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: highlightBg || "var(--pink-soft)", color: highlight || "var(--pink-deep)" }}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>
            {tag}
          </div>
          <div className="text-[13px] font-medium mt-0.5" style={{ color: "var(--ink)" }}>{title}</div>
          <div className="font-display text-[28px] lg:text-[32px] mt-1 font-num" style={{ color: highlight || "var(--ink)" }}>
            {value}
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--ink-soft)" }}>{subtitle}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4" style={{ borderTop: "1px solid var(--border-soft)" }}>
        {drivers.map((d) => (
          <div key={d.label}>
            <div className="label-meta">{d.label}</div>
            <div className="font-num text-[14px] mt-0.5" style={{ color: "var(--ink)" }}>{d.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] italic" style={{ color: "var(--ink-muted)" }}>
        formula: {formula}
      </div>
    </div>
  );
}

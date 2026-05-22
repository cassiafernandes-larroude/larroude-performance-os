import { getNorthStarBundle } from "@/lib/data/northstar";
import { formatCurrency, formatNumber, formatMultiplier, formatPercent } from "@/lib/utils/format";
import { Sparkles, TrendingUp, Users, Repeat, Coins } from "lucide-react";

export const dynamic = "force-dynamic";

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
          <span className="font-num">{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>-</span>
          <span>BigQuery Larroude OS - janela 12 meses</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>North Star</h1>
          <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
            4 metricas-ancora da Larroude - mesma logica do LTV Dashboard oficial
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
            Janela: {us.period.from} a {us.period.to} - {us.source === "BQ" ? "BigQuery Larroude OS" : "Mock"}
          </p>
        </div>

        {/* US */}
        <MarketSection bundle={us} flag="🇺🇸" label="ESTADOS UNIDOS" currency="USD" />

        {/* BR */}
        <div className="mt-10">
          <MarketSection bundle={br} flag="🇧🇷" label="BRASIL" currency="BRL" />
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
          tag="LTV PREDITIVO"
          title="Lifetime Value"
          value={formatCurrency(bundle.ltv_predictive, currency, false)}
          subtitle="Receita media estimada por cliente (12m)"
          drivers={[
            { label: "AOV", value: formatCurrency(bundle.aov, currency, false) },
            { label: "Frequencia", value: `${bundle.purchase_frequency.toFixed(2)}x/ano` },
            { label: "Lifetime", value: `${bundle.customer_lifetime.toFixed(2)}x` },
          ]}
          formula="AOV × Frequencia × Lifetime"
        />

        {/* 2. LTV:CAC */}
        <NorthStarCard
          icon={<Coins className="w-5 h-5" />}
          tag="LTV : CAC"
          title="Eficiencia de Aquisicao"
          value={formatMultiplier(bundle.ltv_cac)}
          subtitle={ratio >= 3 ? "Saudavel" : ratio >= 1.5 ? "Atencao" : "Critico"}
          highlight={ratioColor}
          highlightBg={ratioSoft}
          drivers={[
            { label: "LTV", value: formatCurrency(bundle.ltv_predictive, currency, false) },
            { label: "CAC", value: formatCurrency(bundle.cac, currency, false) },
            { label: "Novos clientes", value: formatNumber(bundle.new_customers) },
          ]}
          formula="LTV / CAC (saudavel >= 3:1)"
        />

        {/* 3. Returning Customer Rate */}
        <NorthStarCard
          icon={<Repeat className="w-5 h-5" />}
          tag="RETURNING RATE"
          title="Taxa de Recompra (12m)"
          value={`${bundle.returning_rate.toFixed(1)}%`}
          subtitle="% de clientes que voltaram a comprar"
          drivers={[
            { label: "Total clientes", value: formatNumber(bundle.total_customers) },
            { label: "Voltaram", value: formatNumber(bundle.returning_customers) },
            { label: "So 1 compra", value: formatNumber(bundle.total_customers - bundle.returning_customers) },
          ]}
          formula="customers com >=2 pedidos / total"
        />

        {/* 4. Net Revenue total */}
        <NorthStarCard
          icon={<Users className="w-5 h-5" />}
          tag="NET REVENUE 12M"
          title="Receita Liquida"
          value={formatCurrency(bundle.total_net_sales, currency)}
          subtitle="Gross - descontos - refunds"
          drivers={[
            { label: "LTV historico", value: formatCurrency(bundle.ltv_historical, currency, false) },
            { label: "Spend total", value: formatCurrency(bundle.total_ad_spend, currency) },
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
          <div className="font-display text-[28px] lg:text-[32px] mt-1 font-num" style={{ color: highlight || "var(--ink)" }}>
            {value}
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--ink-soft)" }}>{subtitle}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4" style={{ borderTop: "1px solid var(--border-soft)" }}>
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

import { FiltersBar } from "@/components/filters/FiltersBar";
import { MetricCard } from "@/components/cards/MetricCard";
import { DiagnosticCard } from "@/components/cards/DiagnosticCard";
import { Sparkles } from "lucide-react";

export default function DailyBriefingPage() {
  return (
    <>
      {/* Top header bar (desktop only) */}
      <header
        className="hidden lg:flex px-8 py-3 items-center justify-between"
        style={{
          background: "var(--paper)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "var(--ink-muted)" }}
        >
          <span>Overview</span>
          <span>/</span>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>
            Daily Briefing
          </span>
        </div>
        <div
          className="flex items-center gap-2 text-[11px]"
          style={{ color: "var(--ink-muted)" }}
        >
          <div className="pulse-dot" />
          <span>Sync</span>
          <span className="font-num">14:32</span>
          <span>·</span>
          <span>
            BigQuery <span style={{ color: "var(--ink)" }}>Larroude OS</span>
          </span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        {/* Page title */}
        <div className="mb-4 lg:mb-5">
          <h1
            className="font-display text-[26px] lg:text-[36px]"
            style={{ color: "var(--ink)" }}
          >
            Daily Briefing
          </h1>
          <p
            className="text-[12px] lg:text-[14px] mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            Meta + Google + Shopify + Klaviyo · via BigQuery
          </p>
          <p
            className="text-[11px] lg:text-[12px] mt-1"
            style={{ color: "var(--ink-muted)" }}
          >
            <span className="hidden lg:inline">
              Dados de{" "}
              <strong style={{ color: "var(--ink-soft)" }}>
                23 de abr. — 20 de mai. de 2026
              </strong>{" "}
              ·{" "}
            </span>
            Atualizado em 21/05/2026, 14:32
          </p>
        </div>

        <FiltersBar />

        {/* ===== US SECTION ===== */}
        <div className="section-marker mb-3">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ink-muted)" }}
            >
              🇺🇸 ESTADOS UNIDOS
            </span>
            <span
              className="badge"
              style={{
                background: "var(--pink-soft)",
                color: "var(--pink-deep)",
              }}
            >
              USD
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-7 lg:mb-8">
          <MetricCard label="AMOUNT SPENT" value="$1.08M" delta={{ value: "+90.4%", positive: true }} />
          <MetricCard label="META SPEND" value="$946K" delta={{ value: "+66.2%", positive: true }} />
          <MetricCard label="GOOGLE SPEND" value="$137K" hint="Google US" />
          <MetricCard label="ROAS GROSS" value="3.20×" delta={{ value: "-15.2%", positive: false }} />
          <MetricCard label="ROAS ORDER" value="3.12×" hint="Rev / Spend" />
          <MetricCard label="ROAS TOTAL" value="2.59×" hint="Total / Spend" />
          <MetricCard label="GROSS SALES" value="$3.46M" delta={{ value: "+61.4%", positive: true }} />
          <MetricCard label="TOTAL SALES" value="$2.80M" delta={{ value: "+61.8%", positive: true }} />
        </div>

        {/* ===== DIAGNÓSTICOS ===== */}
        <div className="section-marker mb-3">
          <div className="flex items-baseline gap-2 lg:gap-3 flex-wrap">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ink-muted)" }}
            >
              🔬 DIAGNÓSTICOS
            </span>
            <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              4 insights · cruzando 4 fontes
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-7">
          <DiagnosticCard
            severity="critical"
            meta="US · CAC"
            title="CAC US +23.7% — fadiga criativa no Meta"
            body={
              <>
                Cruzando{" "}
                <span className="badge badge-meta" style={{ fontSize: 9, padding: "1px 6px" }}>
                  Meta
                </span>{" "}
                +{" "}
                <span className="badge badge-klaviyo" style={{ fontSize: 9, padding: "1px 6px" }}>
                  Klaviyo
                </span>{" "}
                +{" "}
                <span className="badge badge-bq" style={{ fontSize: 9, padding: "1px 6px" }}>
                  BQ
                </span>
                : CTR caiu de 1.42% para 0.94% em 14d, frequência subiu de 2.1 para 3.4. Open rate de novos subscribers caiu 8pp.
              </>
            }
            recommendation="Refresh criativo + lookalike"
          />

          <DiagnosticCard
            severity="warning"
            meta="US · PRÉ-ORDER"
            title="Pré-orders distorcem qualidade de novos clientes"
            body={
              <>
                Pré-orders ={" "}
                <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>
                  58%
                </span>{" "}
                da receita US. A conta PRE-ORDER puxa o nCAC para baixo. Segregando, nCAC core sobe para{" "}
                <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>
                  $142
                </span>
                , não $118.
              </>
            }
            recommendation="Separar core vs pré-order"
          />

          <DiagnosticCard
            severity="positive"
            meta="BR · CRM"
            title="Welcome Series BR superando benchmark"
            body={
              <>
                CVR em{" "}
                <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>
                  4.2%
                </span>{" "}
                (benchmark moda: 2.8%). Receita atribuída:{" "}
                <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>
                  R$ 142K
                </span>
                . Considerar replicar no US.
              </>
            }
            recommendation="Documentar e portar para US"
          />

          <DiagnosticCard
            severity="info"
            meta="US · CRM"
            title="Zero flows de Sunset ativos no Klaviyo US"
            body={
              <>
                <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>
                  37
                </span>{" "}
                em rascunho,{" "}
                <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>
                  0
                </span>{" "}
                ativos. Impacto:{" "}
                <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>
                  ~12%
                </span>{" "}
                de redução no custo Klaviyo.
              </>
            }
            recommendation="Ativar esta semana"
          />
        </div>

        {/* ===== NARRATIVE ===== */}
        <div
          className="card card-prose mb-7"
          style={{
            background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8FB 100%)",
            border: "1px solid var(--pink-soft)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles
              className="w-4 h-4"
              style={{ color: "var(--pink-deep)" }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--pink-deep)" }}
            >
              Análise · cross-source
            </span>
          </div>
          <h2
            className="font-display text-[18px] lg:text-[22px] mb-3"
            style={{ color: "var(--ink)" }}
          >
            Por que o CAC US está subindo?
          </h2>
          <div
            className="space-y-3 text-[12px] lg:text-[13px] leading-relaxed"
            style={{ color: "var(--ink-soft)" }}
          >
            <p>
              <strong style={{ color: "var(--ink)" }}>Ato 1.</strong> Spend cresceu 18% em 30d, mas conversions só 4%. Estamos pagando mais pelo mesmo pool.
            </p>
            <p>
              <strong style={{ color: "var(--ink)" }}>Ato 2.</strong> Frequência média subiu de 2.1 para 3.4, CTR caiu 34%. No Klaviyo, open rate de signups Meta caiu de 38% para 30%.
            </p>
            <p>
              <strong style={{ color: "var(--ink)" }}>Ato 3.</strong> Pré-order tem CAC baixo (~$48). O nCAC &quot;puro&quot; está em{" "}
              <span style={{ color: "var(--negative)", fontWeight: 600 }}>
                $142, +43% vs Q4/25
              </span>
              .
            </p>
            <p style={{ color: "var(--ink)" }}>
              <strong>Próxima ação:</strong> refresh criativo Meta US, separar tracking de pré-order, finalizar CRC.
            </p>
          </div>
        </div>

        {/* ===== BR SECTION ===== */}
        <div className="section-marker mb-3">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ink-muted)" }}
            >
              🇧🇷 BRASIL
            </span>
            <span
              className="badge"
              style={{
                background: "var(--pink-soft)",
                color: "var(--pink-deep)",
              }}
            >
              BRL
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-8">
          <MetricCard label="SPEND" value="R$484K" delta={{ value: "+12.8%", positive: true }} />
          <MetricCard label="ROAS" value="4.42×" delta={{ value: "+8.1%", positive: true }} />
          <MetricCard label="GROSS" value="R$2.14M" delta={{ value: "+18.4%", positive: true }} />
          <MetricCard label="ORDERS" value="3,847" delta={{ value: "+21.3%", positive: true }} />
          <MetricCard label="AOV" value="R$556" hint="Brasil" />
          <MetricCard label="CVR" value="1.42%" delta={{ value: "+0.18", positive: true }} />
          <MetricCard label="META 3 CT." value="3.8×" hint="ROAS médio" />
          <MetricCard label="SITE PERF" value="37/100" delta={{ value: "LCP 23s", positive: false }} />
        </div>
      </div>
    </>
  );
}

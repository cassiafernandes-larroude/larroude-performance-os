import { getSitePerformance } from "@/lib/data/site-performance";
import { Gauge, Zap, Activity, Eye, Server, AlertTriangle, ExternalLink } from "lucide-react";
import { RefreshButton } from "@/components/site-performance/RefreshButton";

export const revalidate = 3600; // 1h

export default async function SitePerformancePage() {
  const [us, br] = await Promise.all([
    getSitePerformance("US"),
    getSitePerformance("BR"),
  ]);

  return (
    <>
      <header
        className="hidden lg:flex px-8 py-3 items-center justify-between"
        style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12px]" style={{ color: "var(--ink)", fontWeight: 500 }}>Site Performance</div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>PageSpeed Insights {us.source === "PageSpeed" ? "ao vivo" : "(mock)"}</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>Site Performance</h1>
          <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
            PageSpeed, LCP, CLS, INP - Core Web Vitals via Google PageSpeed Insights API (mobile)
          </p>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
            <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              Atualizado em {new Date(us.fetched_at).toLocaleString("pt-BR")} - cache 1h
            </p>
            <RefreshButton />
          </div>
        </div>

        <SitePerformanceSection bundle={us} flag="🇺🇸" label="ESTADOS UNIDOS - larroude.com" />

        <div className="mt-10">
          <SitePerformanceSection bundle={br} flag="🇧🇷" label="BRASIL - br.larroude.com" />
        </div>
      </div>
    </>
  );
}

function SitePerformanceSection({ bundle, flag, label }: {
  bundle: Awaited<ReturnType<typeof getSitePerformance>>;
  flag: string;
  label: string;
}) {
  const lcpHealth = bundle.lcp_ms <= 2500 ? "positive" : bundle.lcp_ms <= 4000 ? "warning" : "negative";
  const clsHealth = bundle.cls <= 0.1 ? "positive" : bundle.cls <= 0.25 ? "warning" : "negative";
  const inpHealth = bundle.inp_ms <= 200 ? "positive" : bundle.inp_ms <= 500 ? "warning" : "negative";
  const ttfbHealth = bundle.ttfb_ms <= 800 ? "positive" : bundle.ttfb_ms <= 1800 ? "warning" : "negative";
  const perfHealth = bundle.performance_score >= 90 ? "positive" : bundle.performance_score >= 50 ? "warning" : "negative";

  const cMap = { positive: "var(--positive)", warning: "var(--warning)", negative: "var(--negative)" };
  const bMap = { positive: "var(--positive-soft)", warning: "var(--warning-soft)", negative: "var(--negative-soft)" };

  return (
    <>
      <div className="section-marker mb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>{flag} {label}</span>
          <a href={bundle.url} target="_blank" rel="noopener noreferrer" className="text-[11px] flex items-center gap-1" style={{ color: "var(--pink-deep)" }}>
            visitar site <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* PageSpeed score grande + 4 categorias */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <div className="card md:col-span-2" style={{ padding: 22 }}>
          <div className="flex items-start gap-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: `conic-gradient(${cMap[perfHealth]} ${bundle.performance_score * 3.6}deg, var(--border-soft) 0deg)` }}
            >
              <div className="w-16 h-16 rounded-full flex flex-col items-center justify-center" style={{ background: "white" }}>
                <span className="font-num font-bold text-[24px]" style={{ color: cMap[perfHealth] }}>{bundle.performance_score}</span>
                <span className="text-[9px]" style={{ color: "var(--ink-muted)" }}>/100</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="label-meta mb-1">PERFORMANCE SCORE</div>
              <div className="text-[13px] mb-2" style={{ color: "var(--ink)" }}>
                {bundle.performance_score >= 90 ? "Excelente" : bundle.performance_score >= 50 ? "Precisa melhorar" : "Critico"}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                {(bundle.total_byte_weight / 1_000_000).toFixed(1)} MB - mobile - PageSpeed Insights
              </div>
            </div>
          </div>
        </div>

        <CategoryScore label="ACCESSIBILITY" value={bundle.accessibility_score} />
        <CategoryScore label="BEST PRACTICES" value={bundle.best_practices_score} />
        <CategoryScore label="SEO" value={bundle.seo_score} />
      </div>

      {/* Core Web Vitals */}
      <div className="mb-3 label-meta" style={{ letterSpacing: "0.06em" }}>CORE WEB VITALS</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <VitalCard
          icon={<Eye className="w-4 h-4" />}
          tag="LCP"
          value={`${(bundle.lcp_ms / 1000).toFixed(1)}s`}
          hint="Largest Contentful Paint"
          threshold={lcpHealth === "positive" ? "<= 2.5s" : lcpHealth === "warning" ? "2.5 - 4s" : "> 4s"}
          health={lcpHealth} cMap={cMap} bMap={bMap}
        />
        <VitalCard
          icon={<Activity className="w-4 h-4" />}
          tag="CLS"
          value={bundle.cls.toFixed(3)}
          hint="Cumulative Layout Shift"
          threshold={clsHealth === "positive" ? "<= 0.1" : clsHealth === "warning" ? "0.1 - 0.25" : "> 0.25"}
          health={clsHealth} cMap={cMap} bMap={bMap}
        />
        <VitalCard
          icon={<Zap className="w-4 h-4" />}
          tag="INP"
          value={`${bundle.inp_ms}ms`}
          hint="Interaction to Next Paint"
          threshold={inpHealth === "positive" ? "<= 200ms" : inpHealth === "warning" ? "200 - 500ms" : "> 500ms"}
          health={inpHealth} cMap={cMap} bMap={bMap}
        />
        <VitalCard
          icon={<Server className="w-4 h-4" />}
          tag="TTFB"
          value={`${bundle.ttfb_ms}ms`}
          hint="Time to First Byte"
          threshold={ttfbHealth === "positive" ? "<= 800ms" : ttfbHealth === "warning" ? "800 - 1800ms" : "> 1800ms"}
          health={ttfbHealth} cMap={cMap} bMap={bMap}
        />
      </div>

      {/* Opportunities */}
      {bundle.opportunities.length > 0 && (
        <>
          <div className="mb-3 label-meta" style={{ letterSpacing: "0.06em" }}>OPORTUNIDADES (TOP {bundle.opportunities.length})</div>
          <div className="card mb-6">
            <div className="space-y-3">
              {bundle.opportunities.map((opp, i) => (
                <div key={i} className="flex items-start gap-3 pb-3" style={{ borderBottom: i < bundle.opportunities.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <h4 className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{opp.title}</h4>
                      <span className="text-[11px] font-num flex-shrink-0" style={{ color: "var(--negative)" }}>
                        -{(opp.savings_ms / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{opp.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function CategoryScore({ label, value }: { label: string; value: number }) {
  const color = value >= 90 ? "var(--positive)" : value >= 50 ? "var(--warning)" : "var(--negative)";
  return (
    <div className="card text-center">
      <div className="label-meta mb-1">{label}</div>
      <div className="font-num font-bold text-[26px]" style={{ color }}>{value}</div>
      <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>/100</div>
    </div>
  );
}

function VitalCard({ icon, tag, value, hint, threshold, health, cMap, bMap }: {
  icon: React.ReactNode;
  tag: string;
  value: string;
  hint: string;
  threshold: string;
  health: "positive" | "warning" | "negative";
  cMap: Record<string, string>;
  bMap: Record<string, string>;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bMap[health], color: cMap[health] }}>
          {icon}
        </div>
        <span className="label-meta">{tag}</span>
      </div>
      <div className="font-num font-bold text-[22px]" style={{ color: cMap[health] }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: "var(--ink-muted)" }}>{hint}</div>
      <div className="text-[10px] italic" style={{ color: "var(--ink-muted)" }}>{threshold}</div>
    </div>
  );
}

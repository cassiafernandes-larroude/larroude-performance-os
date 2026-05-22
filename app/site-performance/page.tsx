import { getSitePerformance, type Strategy } from "@/lib/data/site-performance";
import { Zap, Activity, Eye, Server, AlertTriangle, ExternalLink, Smartphone, Monitor, Package, Code, Clock, Image as ImageIcon, FileText, Users, Globe } from "lucide-react";
import { RefreshButton } from "@/components/site-performance/RefreshButton";
import { StrategyToggle } from "@/components/site-performance/StrategyToggle";

export const revalidate = 3600;

export default async function SitePerformancePage({
  searchParams,
}: {
  searchParams: { strategy?: string };
}) {
  const strategy: Strategy = searchParams.strategy === "desktop" ? "desktop" : "mobile";
  const [us, br] = await Promise.all([
    getSitePerformance("US", strategy),
    getSitePerformance("BR", strategy),
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
            Core Web Vitals, lab + field (CrUX), recursos, third-parties, auditorias - via Google PageSpeed Insights
          </p>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
            <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              Atualizado em {new Date(us.fetched_at).toLocaleString("pt-BR")} - cache 1h
            </p>
            <div className="flex items-center gap-2">
              <StrategyToggle current={strategy} />
              <RefreshButton />
            </div>
          </div>
        </div>

        <SitePerformanceSection bundle={us} flag="🇺🇸" label="ESTADOS UNIDOS - larroude.com" />
        <div className="mt-12">
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
  const lcpH = bundle.lcp_ms <= 2500 ? "positive" : bundle.lcp_ms <= 4000 ? "warning" : "negative";
  const clsH = bundle.cls <= 0.1 ? "positive" : bundle.cls <= 0.25 ? "warning" : "negative";
  const inpH = bundle.inp_ms <= 200 ? "positive" : bundle.inp_ms <= 500 ? "warning" : "negative";
  const ttfbH = bundle.ttfb_ms <= 800 ? "positive" : bundle.ttfb_ms <= 1800 ? "warning" : "negative";
  const perfH = bundle.performance_score >= 90 ? "positive" : bundle.performance_score >= 50 ? "warning" : "negative";

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

      {/* Score donut + categorias */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <div className="card md:col-span-2" style={{ padding: 22 }}>
          <div className="flex items-start gap-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: `conic-gradient(${cMap[perfH]} ${bundle.performance_score * 3.6}deg, var(--border-soft) 0deg)` }}
            >
              <div className="w-16 h-16 rounded-full flex flex-col items-center justify-center" style={{ background: "white" }}>
                <span className="font-num font-bold text-[24px]" style={{ color: cMap[perfH] }}>{bundle.performance_score}</span>
                <span className="text-[9px]" style={{ color: "var(--ink-muted)" }}>/100</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="label-meta mb-1">PERFORMANCE SCORE</div>
              <div className="text-[13px] mb-1" style={{ color: "var(--ink)" }}>
                {bundle.performance_score >= 90 ? "Excelente" : bundle.performance_score >= 50 ? "Precisa melhorar" : "Critico"}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                {bundle.strategy === "mobile" ? "📱 Mobile" : "🖥️ Desktop"} - {(bundle.total_byte_weight / 1_000_000).toFixed(1)} MB total
              </div>
            </div>
          </div>
        </div>
        <CategoryScore label="ACCESSIBILITY" value={bundle.accessibility_score} />
        <CategoryScore label="BEST PRACTICES" value={bundle.best_practices_score} />
        <CategoryScore label="SEO" value={bundle.seo_score} />
      </div>

      {/* Core Web Vitals (Lab) */}
      <div className="mb-3 label-meta flex items-center gap-2" style={{ letterSpacing: "0.06em" }}>
        <span>CORE WEB VITALS (LAB)</span>
        <span className="text-[9px] opacity-60">simulado pelo Lighthouse</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <VitalCard icon={<Eye className="w-4 h-4" />} tag="LCP" value={`${(bundle.lcp_ms / 1000).toFixed(1)}s`} hint="Largest Contentful Paint" threshold={lcpH === "positive" ? "<= 2.5s" : lcpH === "warning" ? "2.5 - 4s" : "> 4s"} health={lcpH} cMap={cMap} bMap={bMap} />
        <VitalCard icon={<Activity className="w-4 h-4" />} tag="CLS" value={bundle.cls.toFixed(3)} hint="Cumulative Layout Shift" threshold={clsH === "positive" ? "<= 0.1" : clsH === "warning" ? "0.1 - 0.25" : "> 0.25"} health={clsH} cMap={cMap} bMap={bMap} />
        <VitalCard icon={<Zap className="w-4 h-4" />} tag="INP" value={`${bundle.inp_ms}ms`} hint="Interaction to Next Paint" threshold={inpH === "positive" ? "<= 200ms" : inpH === "warning" ? "200 - 500ms" : "> 500ms"} health={inpH} cMap={cMap} bMap={bMap} />
        <VitalCard icon={<Server className="w-4 h-4" />} tag="TTFB" value={`${bundle.ttfb_ms}ms`} hint="Time to First Byte" threshold={ttfbH === "positive" ? "<= 800ms" : ttfbH === "warning" ? "800-1800ms" : "> 1800ms"} health={ttfbH} cMap={cMap} bMap={bMap} />
      </div>

      {/* Diagnostics adicionais */}
      <div className="mb-3 label-meta" style={{ letterSpacing: "0.06em" }}>DIAGNOSTICOS ADICIONAIS</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MiniStat icon={<Clock className="w-3.5 h-3.5" />} label="FCP" value={`${(bundle.fcp_ms / 1000).toFixed(1)}s`} hint="First Contentful Paint" />
        <MiniStat icon={<Zap className="w-3.5 h-3.5" />} label="TBT" value={`${bundle.tbt_ms}ms`} hint="Total Blocking Time" />
        <MiniStat icon={<Activity className="w-3.5 h-3.5" />} label="Speed Index" value={`${(bundle.si_ms / 1000).toFixed(1)}s`} hint="Velocidade visual" />
        <MiniStat icon={<Code className="w-3.5 h-3.5" />} label="DOM Size" value={bundle.dom_size.toLocaleString("pt-BR")} hint="Elementos no DOM" />
      </div>

      {/* Field Data CrUX */}
      {bundle.field.available && (
        <>
          <div className="mb-3 label-meta flex items-center gap-2" style={{ letterSpacing: "0.06em" }}>
            <Users className="w-3 h-3" />
            <span>FIELD DATA - CrUX (usuarios reais ultimos 28d)</span>
            {bundle.field.overall_category && (
              <span className="badge ml-1" style={{
                background: bundle.field.overall_category === "FAST" ? "var(--positive-soft)" :
                          bundle.field.overall_category === "AVERAGE" ? "var(--warning-soft)" : "var(--negative-soft)",
                color: bundle.field.overall_category === "FAST" ? "var(--positive)" :
                       bundle.field.overall_category === "AVERAGE" ? "var(--warning)" : "var(--negative)",
              }}>
                {bundle.field.overall_category}
              </span>
            )}
          </div>
          <div className="card mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bundle.field.lcp_distributions && (
                <FieldVital label="LCP (real)" value={bundle.field.lcp_ms ? `${(bundle.field.lcp_ms / 1000).toFixed(1)}s` : "n/d"} dist={bundle.field.lcp_distributions} />
              )}
              {bundle.field.cls_distributions && (
                <FieldVital label="CLS (real)" value={bundle.field.cls != null ? bundle.field.cls.toFixed(3) : "n/d"} dist={bundle.field.cls_distributions} />
              )}
              {bundle.field.inp_distributions && (
                <FieldVital label="INP (real)" value={bundle.field.inp_ms ? `${bundle.field.inp_ms}ms` : "n/d"} dist={bundle.field.inp_distributions} />
              )}
            </div>
          </div>
        </>
      )}

      {/* Resource breakdown */}
      <div className="mb-3 label-meta" style={{ letterSpacing: "0.06em" }}>RECURSOS ({bundle.resources.total_requests} requests - {(bundle.resources.total_bytes / 1_000_000).toFixed(1)}MB)</div>
      <div className="card mb-6">
        {bundle.resources.by_type.map((r) => (
          <div key={r.type} className="flex items-center gap-3 mb-2 last:mb-0">
            <div className="w-32 text-[12px] flex items-center gap-2" style={{ color: "var(--ink-soft)" }}>
              {r.type === "Imagens" ? <ImageIcon className="w-3.5 h-3.5" /> :
               r.type === "JavaScript" ? <Code className="w-3.5 h-3.5" /> :
               r.type === "CSS" ? <FileText className="w-3.5 h-3.5" /> :
               <Package className="w-3.5 h-3.5" />}
              <span>{r.type}</span>
            </div>
            <div className="flex-1 h-6 rounded relative" style={{ background: "var(--paper)" }}>
              <div className="h-full rounded flex items-center justify-end px-2" style={{
                width: `${Math.min(100, r.pct)}%`,
                background: r.type === "Imagens" ? "#FFE0EC" : r.type === "JavaScript" ? "var(--meta-bg)" : r.type === "CSS" ? "var(--klaviyo-bg)" : "var(--google-bg)",
              }}>
                <span className="text-[10px] font-num font-semibold" style={{ color: "var(--ink)" }}>{r.pct}%</span>
              </div>
            </div>
            <div className="w-20 text-right text-[11px] font-num" style={{ color: "var(--ink)" }}>{(r.bytes / 1_000_000).toFixed(2)}MB</div>
            <div className="w-12 text-right text-[10px] font-num" style={{ color: "var(--ink-muted)" }}>{r.requests}</div>
          </div>
        ))}
      </div>


      {/* Opportunities */}
      {bundle.opportunities.length > 0 && (
        <>
          <div className="mb-3 label-meta" style={{ letterSpacing: "0.06em" }}>OPORTUNIDADES PRIORITIZADAS ({bundle.opportunities.length})</div>
          <div className="card mb-6">
            <div className="space-y-3">
              {bundle.opportunities.map((opp, i) => {
                const impactColor = opp.impact === "high" ? "var(--negative)" : opp.impact === "medium" ? "var(--warning)" : "var(--ink-muted)";
                const impactBg = opp.impact === "high" ? "var(--negative-soft)" : opp.impact === "medium" ? "var(--warning-soft)" : "var(--border-soft)";
                return (
                  <div key={i} className="flex items-start gap-3 pb-3" style={{ borderBottom: i < bundle.opportunities.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: impactBg, color: impactColor }}>
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                        <h4 className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{opp.title}</h4>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="badge" style={{ background: impactBg, color: impactColor, fontSize: 9 }}>{opp.impact.toUpperCase()}</span>
                          <span className="text-[11px] font-num" style={{ color: "var(--negative)" }}>-{(opp.savings_ms / 1000).toFixed(1)}s</span>
                        </div>
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{opp.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Audits failed (não-opportunities) */}
      {bundle.audits_failed.length > 0 && (
        <>
          <div className="mb-3 label-meta" style={{ letterSpacing: "0.06em" }}>AUDITORIAS COM FALHA ({bundle.audits_failed.length})</div>
          <div className="card mb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {bundle.audits_failed.map((a, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.score === 0 ? "var(--negative)" : "var(--warning)" }} />
                  <span className="text-[11px] flex-1 truncate" style={{ color: "var(--ink-soft)" }}>{a.title}</span>
                  <span className="text-[10px] uppercase" style={{ color: "var(--ink-muted)" }}>{a.category.replace("-", " ")}</span>
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
  icon: React.ReactNode; tag: string; value: string; hint: string; threshold: string;
  health: "positive" | "warning" | "negative";
  cMap: Record<string, string>; bMap: Record<string, string>;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bMap[health], color: cMap[health] }}>{icon}</div>
        <span className="label-meta">{tag}</span>
      </div>
      <div className="font-num font-bold text-[22px]" style={{ color: cMap[health] }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: "var(--ink-muted)" }}>{hint}</div>
      <div className="text-[10px] italic" style={{ color: "var(--ink-muted)" }}>{threshold}</div>
    </div>
  );
}

function MiniStat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="flex items-center gap-2 mb-1" style={{ color: "var(--ink-muted)" }}>
        {icon}
        <span className="label-meta">{label}</span>
      </div>
      <div className="font-num font-bold text-[16px]" style={{ color: "var(--ink)" }}>{value}</div>
      <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>{hint}</div>
    </div>
  );
}

function FieldVital({ label, value, dist }: { label: string; value: string; dist: { good: number; ni: number; poor: number } }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="label-meta">{label}</span>
        <span className="font-num font-bold text-[16px]" style={{ color: "var(--ink)" }}>{value}</span>
      </div>
      <div className="flex h-2 rounded overflow-hidden" style={{ background: "var(--paper)" }}>
        <div style={{ width: `${dist.good}%`, background: "var(--positive)" }} title={`Good ${dist.good}%`} />
        <div style={{ width: `${dist.ni}%`, background: "var(--warning)" }} title={`Needs improvement ${dist.ni}%`} />
        <div style={{ width: `${dist.poor}%`, background: "var(--negative)" }} title={`Poor ${dist.poor}%`} />
      </div>
      <div className="flex justify-between text-[10px] mt-1 font-num" style={{ color: "var(--ink-muted)" }}>
        <span style={{ color: "var(--positive)" }}>good {dist.good}%</span>
        <span style={{ color: "var(--warning)" }}>ni {dist.ni}%</span>
        <span style={{ color: "var(--negative)" }}>poor {dist.poor}%</span>
      </div>
    </div>
  );
}

import type { Market } from "@/types/metric";
import { cached } from "@/lib/cache";

const SITE_URLS: Record<Market, string> = {
  US: "https://larroude.com",
  BR: "https://br.larroude.com",
};

const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type Strategy = "mobile" | "desktop";

export type ResourceBreakdown = {
  total_bytes: number;
  total_requests: number;
  by_type: Array<{ type: string; bytes: number; requests: number; pct: number }>;
};

export type ThirdPartyEntity = {
  entity: string;
  blocking_ms: number;
  transfer_size: number;
};

export type FieldData = {
  available: boolean;
  lcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
  fcp_ms?: number;
  // Distribution percentiles (good, needs-improvement, poor)
  lcp_distributions?: { good: number; ni: number; poor: number };
  cls_distributions?: { good: number; ni: number; poor: number };
  inp_distributions?: { good: number; ni: number; poor: number };
  overall_category?: "FAST" | "AVERAGE" | "SLOW" | "NONE";
};

export type SitePerformanceMetrics = {
  market: Market;
  url: string;
  strategy: Strategy;
  source: "PageSpeed" | "Mock" | "Unavailable";
  fetched_at: string;
  // Scores
  performance_score: number;
  accessibility_score: number;
  best_practices_score: number;
  seo_score: number;
  // Lab Core Web Vitals
  lcp_ms: number;
  inp_ms: number;
  cls: number;
  ttfb_ms: number;
  fcp_ms: number;
  si_ms: number;       // Speed Index
  tbt_ms: number;      // Total Blocking Time
  // Field data (CrUX)
  field: FieldData;
  // Resources
  total_byte_weight: number;
  resources: ResourceBreakdown;
  third_parties: ThirdPartyEntity[];
  // Diagnostics
  dom_size: number;
  unused_js_bytes: number;
  unused_css_bytes: number;
  render_blocking_count: number;
  image_optimization_savings: number;
  // Opportunities
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    savings_ms: number;
    impact: "high" | "medium" | "low";
  }>;
  // Audits failed
  audits_failed: Array<{
    id: string;
    title: string;
    score: number;
    category: string;
  }>;
};

// Cassia 2026-06-21: SEM dados-mock. Quando o PageSpeed Insights falha (rate-limit, sem chave,
// timeout), devolvemos uma estrutura ZERADA com source "Unavailable" e field.available=false —
// a UI avisa "dados indisponiveis" e NAO renderiza Core Web Vitals/scores inventados.
// Antes havia um MOCK_BASE com scores/CWV/CrUX/third-parties hardcoded e plausiveis.
const ZERO_PERF = (market: Market, strategy: Strategy): Omit<SitePerformanceMetrics, "fetched_at" | "source"> => ({
  market, url: SITE_URLS[market], strategy,
  performance_score: 0, accessibility_score: 0, best_practices_score: 0, seo_score: 0,
  lcp_ms: 0, inp_ms: 0, cls: 0, ttfb_ms: 0, fcp_ms: 0, si_ms: 0, tbt_ms: 0,
  field: { available: false },
  total_byte_weight: 0,
  resources: { total_bytes: 0, total_requests: 0, by_type: [] },
  third_parties: [],
  dom_size: 0, unused_js_bytes: 0, unused_css_bytes: 0,
  render_blocking_count: 0, image_optimization_savings: 0,
  opportunities: [], audits_failed: [],
});

async function fetchPageSpeed(market: Market, strategy: Strategy): Promise<SitePerformanceMetrics | null> {
  const url = SITE_URLS[market];
  const apiKey = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy,
    locale: "pt_BR",
  });
  // Pedir todas as categorias
  ["performance", "accessibility", "best-practices", "seo"].forEach((c) => params.append("category", c));
  if (apiKey) params.set("key", apiKey);

  try {
    const res = await fetch(`${PSI_API}?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      console.warn(`PSI ${market}/${strategy} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as Record<string, unknown>;
    const lh = data.lighthouseResult as Record<string, unknown> | undefined;
    if (!lh) return null;

    const cats = (lh.categories as Record<string, { score?: number }>) ?? {};
    const audits = (lh.audits as Record<string, {
      numericValue?: number;
      score?: number;
      title?: string;
      description?: string;
      details?: { overallSavingsMs?: number; items?: unknown[]; type?: string };
    }>) ?? {};

    // Opportunities (audits com overallSavingsMs > 200)
    const opportunities: SitePerformanceMetrics["opportunities"] = [];
    for (const [id, audit] of Object.entries(audits)) {
      const savings = audit.details?.overallSavingsMs ?? 0;
      if (savings > 150 && audit.title) {
        const impact: "high" | "medium" | "low" = savings >= 1000 ? "high" : savings >= 400 ? "medium" : "low";
        opportunities.push({
          id,
          title: audit.title,
          description: (audit.description ?? "").replace(/\[Learn more.*?\]\([^)]+\)/g, "").trim().slice(0, 220),
          savings_ms: Math.round(savings),
          impact,
        });
      }
    }
    opportunities.sort((a, b) => b.savings_ms - a.savings_ms);

    // Audits failed (score < 0.9)
    const auditsFailed: SitePerformanceMetrics["audits_failed"] = [];
    const categoryAudits: Record<string, { auditRefs?: Array<{ id: string }> }> = cats as never;
    for (const [catKey, cat] of Object.entries(categoryAudits)) {
      const refs = cat.auditRefs ?? [];
      for (const ref of refs) {
        const audit = audits[ref.id];
        if (audit && audit.score !== null && audit.score !== undefined && audit.score < 0.9 && audit.title) {
          // skip se ja esta nas opportunities
          if (opportunities.find((o) => o.id === ref.id)) continue;
          auditsFailed.push({
            id: ref.id,
            title: audit.title,
            score: audit.score ?? 0,
            category: catKey,
          });
        }
      }
    }

    // Resource breakdown (resource-summary)
    type ResItem = { resourceType?: string; transferSize?: number; requestCount?: number };
    const resourceSummary = (audits["resource-summary"]?.details?.items ?? []) as ResItem[];
    const totalReq = resourceSummary.find((r) => r.resourceType === "total");
    const total_bytes = Math.round(totalReq?.transferSize ?? 0);
    const total_requests = totalReq?.requestCount ?? 0;
    const typeMap: Record<string, string> = {
      image: "Imagens", script: "JavaScript", stylesheet: "CSS", font: "Fontes",
      document: "HTML/Outros", other: "HTML/Outros", media: "Video/Audio", "third-party": "Third-party",
    };
    const by_type = resourceSummary
      .filter((r): r is ResItem => r.resourceType !== "total" && r.resourceType !== "third-party")
      .map((r) => ({
        type: typeMap[r.resourceType ?? ""] ?? r.resourceType ?? "Outros",
        bytes: Math.round(r.transferSize ?? 0),
        requests: r.requestCount ?? 0,
        pct: total_bytes > 0 ? Math.round(((r.transferSize ?? 0) / total_bytes) * 100) : 0,
      }))
      .filter((r) => r.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes);

    // Third-party
    type TpItem = { entity?: string | { text?: string }; blockingTime?: number; transferSize?: number };
    const tpItems = (audits["third-party-summary"]?.details?.items ?? []) as TpItem[];
    const third_parties: ThirdPartyEntity[] = tpItems
      .map((item) => ({
        entity: typeof item.entity === "string" ? item.entity : (item.entity?.text ?? "?"),
        blocking_ms: Math.round(item.blockingTime ?? 0),
        transfer_size: Math.round(item.transferSize ?? 0),
      }))
      .filter((t) => t.entity !== "?" && (t.blocking_ms > 0 || t.transfer_size > 10_000))
      .sort((a, b) => b.blocking_ms - a.blocking_ms)
      .slice(0, 8);

    // Field data (CrUX)
    const fieldExp = (data.loadingExperience as { metrics?: Record<string, { percentile?: number; distributions?: Array<{ proportion: number }> }>; overall_category?: string }) ?? {};
    const metrics = fieldExp.metrics ?? {};
    const dist = (key: string) => {
      const ds = metrics[key]?.distributions ?? [];
      return {
        good: Math.round((ds[0]?.proportion ?? 0) * 100),
        ni: Math.round((ds[1]?.proportion ?? 0) * 100),
        poor: Math.round((ds[2]?.proportion ?? 0) * 100),
      };
    };
    const field: FieldData = {
      available: Object.keys(metrics).length > 0,
      lcp_ms: metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
      inp_ms: metrics.INTERACTION_TO_NEXT_PAINT?.percentile,
      cls: metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : undefined,
      ttfb_ms: metrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile,
      fcp_ms: metrics.FIRST_CONTENTFUL_PAINT_MS?.percentile,
      lcp_distributions: dist("LARGEST_CONTENTFUL_PAINT_MS"),
      cls_distributions: dist("CUMULATIVE_LAYOUT_SHIFT_SCORE"),
      inp_distributions: dist("INTERACTION_TO_NEXT_PAINT"),
      overall_category: (fieldExp.overall_category as FieldData["overall_category"]) ?? "NONE",
    };

    return {
      market, url, strategy, source: "PageSpeed" as const, fetched_at: new Date().toISOString(),
      performance_score: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility_score: Math.round((cats.accessibility?.score ?? 0) * 100),
      best_practices_score: Math.round((cats["best-practices"]?.score ?? 0) * 100),
      seo_score: Math.round((cats.seo?.score ?? 0) * 100),
      lcp_ms: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
      inp_ms: Math.round(audits["interaction-to-next-paint"]?.numericValue ?? audits["max-potential-fid"]?.numericValue ?? 0),
      cls: Number(audits["cumulative-layout-shift"]?.numericValue?.toFixed(3) ?? 0),
      ttfb_ms: Math.round(audits["server-response-time"]?.numericValue ?? 0),
      fcp_ms: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
      si_ms: Math.round(audits["speed-index"]?.numericValue ?? 0),
      tbt_ms: Math.round(audits["total-blocking-time"]?.numericValue ?? 0),
      field,
      total_byte_weight: Math.round(audits["total-byte-weight"]?.numericValue ?? total_bytes),
      resources: { total_bytes, total_requests, by_type },
      third_parties,
      dom_size: Math.round(audits["dom-size"]?.numericValue ?? 0),
      unused_js_bytes: Math.round(audits["unused-javascript"]?.details?.overallSavingsMs ?? 0),
      unused_css_bytes: Math.round(audits["unused-css-rules"]?.details?.overallSavingsMs ?? 0),
      render_blocking_count: ((audits["render-blocking-resources"]?.details?.items ?? []) as unknown[]).length,
      image_optimization_savings: Math.round(audits["uses-optimized-images"]?.details?.overallSavingsMs ?? 0),
      opportunities: opportunities.slice(0, 10),
      audits_failed: auditsFailed.slice(0, 12),
    };
  } catch (err) {
    console.warn(`PSI ${market}/${strategy} fetch falhou:`, err);
    return null;
  }
}

export async function getSitePerformance(market: Market, strategy: Strategy = "mobile"): Promise<SitePerformanceMetrics> {
  return cached(`site-perf-v3:${market}:${strategy}`, 3600, async () => {
    const real = await fetchPageSpeed(market, strategy);
    if (real) return real;
    return {
      ...ZERO_PERF(market, strategy),
      source: "Unavailable" as const,
      fetched_at: new Date().toISOString(),
    };
  });
}

export { SITE_URLS };

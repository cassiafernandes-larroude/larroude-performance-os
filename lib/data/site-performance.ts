import type { Market } from "@/types/metric";
import { cached } from "@/lib/cache";

const SITE_URLS: Record<Market, string> = {
  US: "https://larroude.com",
  BR: "https://br.larroude.com",
};

const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type SitePerformanceMetrics = {
  market: Market;
  url: string;
  source: "PageSpeed" | "Mock";
  fetched_at: string;
  // Scores 0-100
  performance_score: number;
  accessibility_score: number;
  best_practices_score: number;
  seo_score: number;
  // Core Web Vitals
  lcp_ms: number;        // Largest Contentful Paint
  inp_ms: number;        // Interaction to Next Paint (substituiu FID em 2024)
  cls: number;           // Cumulative Layout Shift
  ttfb_ms: number;       // Time to First Byte
  fcp_ms: number;        // First Contentful Paint
  // Tamanho
  total_byte_weight: number;
  // Top issues
  opportunities: Array<{
    title: string;
    description: string;
    savings_ms: number;
  }>;
};

const MOCK_US: Omit<SitePerformanceMetrics, "market" | "url" | "source" | "fetched_at"> = {
  performance_score: 78, accessibility_score: 92, best_practices_score: 88, seo_score: 95,
  lcp_ms: 2400, inp_ms: 180, cls: 0.04, ttfb_ms: 420, fcp_ms: 1200, total_byte_weight: 3_200_000,
  opportunities: [
    { title: "Reduzir JavaScript nao utilizado", description: "Remover scripts inativos pode economizar 850ms", savings_ms: 850 },
    { title: "Otimizar imagens", description: "Servir imagens em formato moderno (WebP/AVIF)", savings_ms: 620 },
  ],
};

const MOCK_BR: Omit<SitePerformanceMetrics, "market" | "url" | "source" | "fetched_at"> = {
  performance_score: 37, accessibility_score: 82, best_practices_score: 75, seo_score: 88,
  lcp_ms: 23000, inp_ms: 450, cls: 0.18, ttfb_ms: 1800, fcp_ms: 4200, total_byte_weight: 8_500_000,
  opportunities: [
    { title: "LCP critico: 23s", description: "Largest Contentful Paint muito acima do limite saudavel (2.5s). Lazy-load + CDN edge BR", savings_ms: 18000 },
    { title: "JavaScript bloqueando render", description: "Inline critical CSS e defer scripts nao essenciais", savings_ms: 3500 },
    { title: "Imagens nao otimizadas", description: "8.5MB de bytes totais. Converter pra WebP/AVIF + lazy", savings_ms: 2100 },
    { title: "Cache do browser", description: "Adicionar Cache-Control de longa duracao para assets estaticos", savings_ms: 800 },
  ],
};

async function fetchPageSpeed(market: Market): Promise<SitePerformanceMetrics | null> {
  const url = SITE_URLS[market];
  const apiKey = process.env.PAGESPEED_API_KEY; // opcional - sem chave funciona com rate limit menor
  const params = new URLSearchParams({
    url,
    strategy: "mobile",
    category: "performance",
    locale: "pt_BR",
  });
  if (apiKey) params.set("key", apiKey);

  try {
    const res = await fetch(`${PSI_API}?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(50000),
    });
    if (!res.ok) {
      console.warn(`PSI ${market} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as {
      lighthouseResult?: {
        categories?: Record<string, { score?: number }>;
        audits?: Record<string, { numericValue?: number; title?: string; description?: string; details?: { overallSavingsMs?: number } }>;
      };
      loadingExperience?: { metrics?: Record<string, { percentile?: number }> };
    };

    const lh = data.lighthouseResult;
    if (!lh) return null;
    const cats = lh.categories ?? {};
    const audits = lh.audits ?? {};

    const opportunities: Array<{ title: string; description: string; savings_ms: number }> = [];
    for (const [, audit] of Object.entries(audits)) {
      const savings = audit.details?.overallSavingsMs ?? 0;
      if (savings > 200 && audit.title) {
        opportunities.push({
          title: audit.title,
          description: (audit.description ?? "").replace(/\[Learn more.*?\]\([^)]+\)/g, "").trim().slice(0, 200),
          savings_ms: Math.round(savings),
        });
      }
    }
    opportunities.sort((a, b) => b.savings_ms - a.savings_ms);

    return {
      market, url, source: "PageSpeed" as const, fetched_at: new Date().toISOString(),
      performance_score: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility_score: Math.round((cats.accessibility?.score ?? 0) * 100),
      best_practices_score: Math.round((cats["best-practices"]?.score ?? 0) * 100),
      seo_score: Math.round((cats.seo?.score ?? 0) * 100),
      lcp_ms: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
      inp_ms: Math.round(audits["interaction-to-next-paint"]?.numericValue ?? audits["max-potential-fid"]?.numericValue ?? 0),
      cls: Number(audits["cumulative-layout-shift"]?.numericValue?.toFixed(3) ?? 0),
      ttfb_ms: Math.round(audits["server-response-time"]?.numericValue ?? 0),
      fcp_ms: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
      total_byte_weight: Math.round(audits["total-byte-weight"]?.numericValue ?? 0),
      opportunities: opportunities.slice(0, 6),
    };
  } catch (err) {
    console.warn(`PSI ${market} fetch falhou:`, err);
    return null;
  }
}

export async function getSitePerformance(market: Market): Promise<SitePerformanceMetrics> {
  return cached(`site-perf-v1:${market}`, 3600, async () => {
    const real = await fetchPageSpeed(market);
    if (real) return real;
    return {
      market,
      url: SITE_URLS[market],
      source: "Mock" as const,
      fetched_at: new Date().toISOString(),
      ...(market === "US" ? MOCK_US : MOCK_BR),
    };
  });
}

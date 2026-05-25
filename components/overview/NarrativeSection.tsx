import { Sparkles } from "lucide-react";
import { generateNarrative } from "@/lib/intelligence/narrative";
import { cached } from "@/lib/cache";
import type { MetricBundle } from "@/types/metric";
import type { Diagnostic } from "@/types/diagnostic";

type Props = {
  us: MetricBundle;
  br: MetricBundle;
  diagnostics: Diagnostic[];
  period: string;
};

// Server Component carregado dentro de Suspense - nao bloqueia render dos cards
export async function NarrativeSection({ us, br, diagnostics, period }: Props) {
  const narrative = await cached(
    `narrative:${period}`,
    3600, // 1h cache - narrativa nao muda tanto
    () => generateNarrative(us, br, diagnostics)
  );

  return (
    <div
      className="card card-prose mb-7"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8FB 100%)",
        border: "1px solid var(--pink-soft)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: "var(--pink-deep)" }} />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--pink-deep)" }}
          >
            Analysis - cross-source
          </span>
        </div>
        <span className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
          {narrative.source === "anthropic" ? "via Claude" : "fallback"}
        </span>
      </div>
      <h2
        className="font-display text-[18px] lg:text-[22px] mb-3"
        style={{ color: "var(--ink)" }}
      >
        {narrative.title}
      </h2>
      <div
        className="text-[12px] lg:text-[13px] leading-relaxed whitespace-pre-line"
        style={{ color: "var(--ink-soft)" }}
      >
        {narrative.body}
      </div>
    </div>
  );
}

export function NarrativeSkeleton() {
  return (
    <div
      className="card card-prose mb-7 animate-pulse"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8FB 100%)",
        border: "1px solid var(--pink-soft)",
        minHeight: 160,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: "var(--pink-deep)" }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--pink-deep)" }}
        >
          Analysis - generating...
        </span>
      </div>
      <div className="space-y-2">
        <div className="h-4 rounded" style={{ background: "var(--pink-soft)", width: "60%" }} />
        <div className="h-3 rounded" style={{ background: "var(--pink-soft)", width: "90%" }} />
        <div className="h-3 rounded" style={{ background: "var(--pink-soft)", width: "75%" }} />
      </div>
    </div>
  );
}

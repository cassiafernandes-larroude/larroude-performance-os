import { NextResponse } from "next/server";
import { zscore } from "@/lib/intelligence/diagnostics";
import { getMetricBundle } from "@/lib/data/metrics";

export const dynamic = "force-dynamic";

type AnomalyRow = {
  market: string;
  metric: string;
  current_value: number;
  zscore: number;
  is_anomaly: boolean;
  context: string;
};

export async function GET() {
  // Para demo: usamos delta_pct dos metrics atuais como serie sintetica
  const [us, br] = await Promise.all([
    getMetricBundle("US", "28d"),
    getMetricBundle("BR", "28d"),
  ]);

  const results: AnomalyRow[] = [];

  for (const bundle of [us, br]) {
    const deltas = bundle.metrics
      .map((m) => m.delta_pct)
      .filter((x): x is number => x !== null);

    if (deltas.length < 3) continue;

    for (const m of bundle.metrics) {
      if (m.delta_pct === null) continue;
      const z = zscore(deltas, m.delta_pct);
      if (Math.abs(z) > 2) {
        results.push({
          market: bundle.market,
          metric: m.key,
          current_value: m.delta_pct,
          zscore: Number(z.toFixed(2)),
          is_anomaly: true,
          context: `${m.label} delta de ${m.delta_pct.toFixed(1)}% esta ${z > 0 ? "acima" : "abaixo"} de 2 desvios da media do periodo.`,
        });
      }
    }
  }

  return NextResponse.json({
    count: results.length,
    threshold_sigma: 2,
    anomalies: results,
    generated_at: new Date().toISOString(),
  });
}

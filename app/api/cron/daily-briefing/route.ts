import { NextResponse } from "next/server";
import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import { generateNarrative } from "@/lib/intelligence/narrative";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Vercel Cron envia header de auth
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  invalidate("metrics:");

  const [us, br] = await Promise.all([
    getMetricBundle("US", "28d"),
    getMetricBundle("BR", "28d"),
  ]);
  const diagnostics = await runDiagnostics({ us, br });
  const narrative = await generateNarrative(us, br, diagnostics);

  return NextResponse.json({
    success: true,
    generated_at: new Date().toISOString(),
    metrics: { us_count: us.metrics.length, br_count: br.metrics.length },
    diagnostics_count: diagnostics.length,
    narrative_source: narrative.source,
    narrative_title: narrative.title,
  });
}

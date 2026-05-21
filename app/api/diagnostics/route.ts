import { NextRequest, NextResponse } from "next/server";
import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import type { Period } from "@/types/metric";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const period = (sp.get("period") || "28d") as Period;

  const [us, br] = await Promise.all([
    getMetricBundle("US", period),
    getMetricBundle("BR", period),
  ]);
  const diagnostics = await runDiagnostics({ us, br });

  return NextResponse.json({
    period,
    count: diagnostics.length,
    diagnostics,
    generated_at: new Date().toISOString(),
  });
}

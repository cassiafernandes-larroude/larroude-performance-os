import { NextRequest, NextResponse } from "next/server";
import { getMetricBundle } from "@/lib/data/metrics";
import type { Market, Period } from "@/types/metric";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_PERIODS: Period[] = ["7d", "14d", "28d", "3M", "6M", "12M"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = (sp.get("market") || "US").toUpperCase() as Market;
  const period = (sp.get("period") || "28d") as Period;

  if (!["US", "BR"].includes(market)) {
    return NextResponse.json({ error: "invalid market" }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  try {
    const bundle = await getMetricBundle(market, period);
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

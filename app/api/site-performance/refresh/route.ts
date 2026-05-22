import { NextResponse } from "next/server";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST() {
  invalidate("site-perf-v1:");
  return NextResponse.json({ ok: true, invalidated: "site-perf-v1:*", at: new Date().toISOString() });
}

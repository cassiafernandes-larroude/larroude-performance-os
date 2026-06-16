import { NextResponse } from "next/server";
import { hasBigQueryCredentials } from "@/lib/bigquery/client";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    integrations: {
      bigquery: hasBigQueryCredentials() ? "configured" : "missing",
      anthropic: process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
    },
  });
}

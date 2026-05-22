import { NextResponse } from "next/server";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";

export const dynamic = "force-dynamic";

type ProbeResult = {
  query: string;
  ok: boolean;
  rows?: number;
  sample?: unknown;
  error?: string;
  ms: number;
};

async function probe(name: string, sql: string, params: Record<string, unknown> = {}): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const rows = await runQuery(sql, params);
    return {
      query: name,
      ok: true,
      rows: rows.length,
      sample: rows.slice(0, 1),
      ms: Date.now() - t0,
    };
  } catch (err) {
    return {
      query: name,
      ok: false,
      error: String(err).slice(0, 500),
      ms: Date.now() - t0,
    };
  }
}

export async function GET() {
  if (!hasBigQueryCredentials()) {
    return NextResponse.json({ error: "GCP_SA_KEY_BASE64 missing" }, { status: 500 });
  }

  const results: ProbeResult[] = [];

  // 1. SELECT 1 simples (testa auth)
  results.push(await probe("auth_check", "SELECT 1 AS ok"));

  // 2. Listar datasets visíveis
  results.push(await probe(
    "list_datasets",
    "SELECT schema_name FROM `larroude-data-platform.INFORMATION_SCHEMA.SCHEMATA` LIMIT 30"
  ));

  // 3. Test shopify_us.orders count
  results.push(await probe(
    "shopify_us_orders_count",
    "SELECT COUNT(*) AS n FROM `larroude-data-platform.shopify_us.orders` WHERE DATE(created_at) >= CURRENT_DATE() - 28"
  ));

  // 4. Test shopify_br.orders count
  results.push(await probe(
    "shopify_br_orders_count",
    "SELECT COUNT(*) AS n FROM `larroude-data-platform.shopify_br.orders` WHERE DATE(created_at) >= CURRENT_DATE() - 28"
  ));

  // 5. Test fct_ads_spend_daily existence
  results.push(await probe(
    "fct_ads_spend_daily_count",
    "SELECT COUNT(*) AS n FROM `larroude-data-platform.gold_marketing.fct_ads_spend_daily` WHERE DATE(date) >= CURRENT_DATE() - 28"
  ));

  return NextResponse.json({
    project: process.env.GCP_PROJECT_ID,
    timestamp: new Date().toISOString(),
    results,
  });
}

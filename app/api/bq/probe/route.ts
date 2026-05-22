import { NextResponse } from "next/server";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";
import { ordersAggregateSQL, adsSpendSQL } from "@/lib/bigquery/queries/metrics";

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
    return { query: name, ok: true, rows: rows.length, sample: rows.slice(0, 2), ms: Date.now() - t0 };
  } catch (err) {
    return { query: name, ok: false, error: String(err).slice(0, 800), ms: Date.now() - t0 };
  }
}

export async function GET() {
  if (!hasBigQueryCredentials()) {
    return NextResponse.json({ error: "GCP_SA_KEY_BASE64 missing" }, { status: 500 });
  }

  const today = new Date();
  const fromDate = new Date(today.getTime() - 28 * 86400000).toISOString().slice(0, 10);
  const toDate = today.toISOString().slice(0, 10);

  const results: ProbeResult[] = [];

  results.push(await probe("auth_check", "SELECT 1 AS ok"));

  // Schema check: ver colunas da shopify_us.orders
  results.push(await probe(
    "schema_us_orders",
    "SELECT column_name, data_type FROM `larroude-data-platform.shopify_us.INFORMATION_SCHEMA.COLUMNS` WHERE table_name = 'orders' LIMIT 30"
  ));

  // Testar a query real de orders aggregate
  results.push(await probe(
    "orders_aggregate_us",
    ordersAggregateSQL("US"),
    { from: fromDate, to: toDate }
  ));

  results.push(await probe(
    "orders_aggregate_br",
    ordersAggregateSQL("BR"),
    { from: fromDate, to: toDate }
  ));

  // Testar ads spend
  results.push(await probe(
    "ads_spend_us",
    adsSpendSQL("US"),
    { market: "us", from: fromDate, to: toDate }
  ));

  // Schema check fct_ads_spend_daily
  results.push(await probe(
    "schema_ads",
    "SELECT column_name FROM `larroude-data-platform.gold_marketing.INFORMATION_SCHEMA.COLUMNS` WHERE table_name = 'fct_ads_spend_daily' LIMIT 30"
  ));

  return NextResponse.json({
    project: process.env.GCP_PROJECT_ID,
    date_range: { from: fromDate, to: toDate },
    timestamp: new Date().toISOString(),
    results,
  });
}

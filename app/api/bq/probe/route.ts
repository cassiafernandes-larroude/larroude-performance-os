import { NextResponse } from "next/server";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";

export const dynamic = "force-dynamic";

async function probe(name: string, sql: string, params: Record<string, unknown> = {}) {
  const t0 = Date.now();
  try {
    const rows = await runQuery(sql, params);
    return { query: name, ok: true, rows: rows.length, sample: rows.slice(0, 3), ms: Date.now() - t0 };
  } catch (err) {
    return { query: name, ok: false, error: String(err).slice(0, 600), ms: Date.now() - t0 };
  }
}

export async function GET() {
  if (!hasBigQueryCredentials()) return NextResponse.json({ error: "no creds" }, { status: 500 });

  const results = [];

  // Todas colunas da fct_ads_spend_daily
  results.push(await probe(
    "ads_cols",
    "SELECT column_name, data_type FROM `larroude-data-platform.gold_marketing.INFORMATION_SCHEMA.COLUMNS` WHERE table_name = 'fct_ads_spend_daily' ORDER BY ordinal_position"
  ));

  // Amostra de fct_ads_spend_daily
  results.push(await probe(
    "ads_sample",
    "SELECT * FROM `larroude-data-platform.gold_marketing.fct_ads_spend_daily` ORDER BY date DESC LIMIT 3"
  ));

  // Amostra de shopify_us.orders.customer (JSON type)
  results.push(await probe(
    "orders_customer_sample",
    "SELECT JSON_EXTRACT_SCALAR(customer, '$.numberOfOrders') AS num_orders, JSON_EXTRACT_SCALAR(customer, '$.id') AS cust_id FROM `larroude-data-platform.shopify_us.orders` WHERE customer IS NOT NULL LIMIT 5"
  ));

  return NextResponse.json({ timestamp: new Date().toISOString(), results });
}

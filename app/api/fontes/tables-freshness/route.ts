import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tabelas BQ usadas pelo Performance OS — inventario manual mapeado em 2026-06-13.
const TABLES = [
  {
    project: "larroude-data-prod",
    dataset: "stg_shopify",
    table: "orders",
    region: "US",
    dateCol: "DATE(created_at, 'America/New_York')",
    usedIn: "Main, Overview, CAC, LTV, Channel Share, UE, Apostar, Shopify",
  },
  {
    project: "larroude-data-prod",
    dataset: "stg_shopify_br",
    table: "orders",
    region: "BR",
    dateCol: "DATE(created_at, 'America/Sao_Paulo')",
    usedIn: "Main, Overview, CAC, LTV, Channel Share, UE, Apostar, Shopify",
  },
  {
    project: "larroude-data-prod",
    dataset: "stg_shopify",
    table: "order_refunds",
    region: "US",
    dateCol: null,
    usedIn: "Main, Shopify, UE (exchanges/returns)",
  },
  {
    project: "larroude-data-prod",
    dataset: "stg_shopify_br",
    table: "order_refunds",
    region: "BR",
    dateCol: null,
    usedIn: "Main, Shopify, UE (exchanges/returns)",
  },
  {
    project: "larroude-data-prod",
    dataset: "stg_shopify",
    table: "abandoned_checkouts",
    region: "US",
    dateCol: null,
    usedIn: "Main (conversion funnel), Shopify",
  },
  {
    project: "larroude-data-prod",
    dataset: "stg_shopify_br",
    table: "abandoned_checkouts",
    region: "BR",
    dateCol: null,
    usedIn: "Main (conversion funnel), Shopify",
  },
  {
    project: "larroude-data-prod",
    dataset: "gold",
    table: "all_channels_daily",
    region: "GLOBAL",
    dateCol: "date",
    usedIn: "Main (spend & channel mix), Overview, Channel Share, Consolidated",
  },
  {
    project: "larroude-data-prod",
    dataset: "gold",
    table: "fx_rates_monthly",
    region: "GLOBAL",
    dateCol: null,
    usedIn: "BRL→USD conversion in Main, LTV, CAC, Executive, Consolidated",
  },
  {
    project: "larroude-data-prod",
    dataset: "gold_sales",
    table: "returns_daily",
    region: "GLOBAL",
    dateCol: "return_date",
    usedIn: "Main (Net Sales)",
  },
  {
    project: "larroude-data-platform",
    dataset: "gold",
    table: "unite_economics_us",
    region: "US",
    dateCol: null,
    usedIn: "CAC legacy",
  },
  {
    project: "larroude-data-platform",
    dataset: "gold",
    table: "unite_economics_br",
    region: "BR",
    dateCol: null,
    usedIn: "CAC legacy",
  },
  {
    project: "larroude-data-platform",
    dataset: "gold_marketing",
    table: "fct_ads_spend_daily",
    region: "GLOBAL",
    dateCol: "date",
    usedIn: "CAC + LTV (Google Ads spend)",
  },
];

function getClient(projectId: string): BigQuery | null {
  const keyBase64 = process.env.GCP_SA_KEY_BASE64;
  if (!keyBase64) return null;
  try {
    const credentials = JSON.parse(
      Buffer.from(keyBase64, "base64").toString("utf-8")
    );
    return new BigQuery({ projectId, credentials });
  } catch {
    return null;
  }
}

async function tablesMeta(projectId: string, datasetId: string) {
  const client = getClient(projectId);
  if (!client) return null;
  try {
    const sql = `SELECT table_id, last_modified_time, row_count, size_bytes FROM \`${projectId}.${datasetId}.__TABLES__\``;
    const [job] = await client.createQueryJob({ query: sql, location: "US" });
    const [rows] = await job.getQueryResults();
    return rows as Array<{
      table_id: string;
      last_modified_time: string | number;
      row_count: string | number;
      size_bytes: string | number;
    }>;
  } catch {
    return null;
  }
}

async function lastDayOf(projectId: string, dataset: string, table: string, dateCol: string | null) {
  if (!dateCol) return null;
  const client = getClient(projectId);
  if (!client) return null;
  try {
    let expr = dateCol;
    if (dateCol.startsWith("DATE(") || dateCol.includes("(")) expr = dateCol;
    else expr = dateCol;
    const sql = `SELECT FORMAT_DATE('%Y-%m-%d', MAX(${expr})) AS d FROM \`${projectId}.${dataset}.${table}\``;
    const [job] = await client.createQueryJob({ query: sql, location: "US" });
    const [rows] = await job.getQueryResults();
    return (rows?.[0] as any)?.d || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const byProjectDataset: Record<string, Record<string, any[]>> = {};
  for (const t of TABLES) {
    const key = `${t.project}.${t.dataset}`;
    if (!byProjectDataset[t.project]) byProjectDataset[t.project] = {};
    if (!byProjectDataset[t.project][t.dataset]) {
      const meta = await tablesMeta(t.project, t.dataset);
      byProjectDataset[t.project][t.dataset] = meta || [];
    }
  }

  const out = await Promise.all(
    TABLES.map(async (t) => {
      const meta = byProjectDataset[t.project][t.dataset]?.find((m) => m.table_id === t.table);
      const lastDay = await lastDayOf(t.project, t.dataset, t.table, t.dateCol);
      const lastMod = meta ? new Date(Number(meta.last_modified_time)) : null;
      return {
        project: t.project,
        dataset: t.dataset,
        table: t.table,
        region: t.region,
        usedIn: t.usedIn,
        lastModifiedIso: lastMod ? lastMod.toISOString() : null,
        lastDayData: lastDay,
        rowCount: meta ? Number(meta.row_count) : null,
        sizeMb: meta ? Math.round((Number(meta.size_bytes) / 1024 / 1024) * 10) / 10 : null,
      };
    })
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    tables: out,
  });
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPERMETRICS_API = "https://api.supermetrics.com/enterprise/v2/query";

export async function GET() {
  const apiKey = process.env.SUPERMETRICS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "SUPERMETRICS_API_KEY missing" }, { status: 500 });
  }

  const results: Array<{ test: string; ok: boolean; data?: unknown; error?: string }> = [];

  // Test 1: Meta US (Larroude + Pre-Order)
  try {
    const params = {
      ds_id: "FA",
      ds_accounts: ["2047856822417350", "929449929417505"],
      fields: "Date,Spend",
      date_range_type: "custom",
      start_date: "2026-04-24",
      end_date: "2026-05-21",
      max_rows: 100,
    };
    const url = `${SUPERMETRICS_API}?json=${encodeURIComponent(JSON.stringify(params))}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const txt = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(txt); } catch {}
    results.push({
      test: "meta_us_combined",
      ok: res.ok,
      data: {
        status: res.status,
        rows: Array.isArray((parsed as { data?: unknown[] })?.data) ? ((parsed as { data: unknown[] }).data.length - 1) : 0,
        first_rows: ((parsed as { data?: unknown[] })?.data || []).slice(0, 3),
        total_spend: ((parsed as { data?: unknown[][] })?.data || []).slice(1).reduce((s, r) => s + Number(r[1] ?? 0), 0),
        raw_preview: txt.slice(0, 500),
      },
    });
  } catch (err) {
    results.push({ test: "meta_us_combined", ok: false, error: String(err) });
  }

  // Test 2: Google US
  try {
    const params = {
      ds_id: "AW",
      ds_accounts: ["7244161860"],
      fields: "Date,Cost",
      date_range_type: "custom",
      start_date: "2026-04-24",
      end_date: "2026-05-21",
      max_rows: 100,
    };
    const url = `${SUPERMETRICS_API}?json=${encodeURIComponent(JSON.stringify(params))}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const txt = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(txt); } catch {}
    results.push({
      test: "google_us",
      ok: res.ok,
      data: {
        status: res.status,
        rows: Array.isArray((parsed as { data?: unknown[] })?.data) ? ((parsed as { data: unknown[] }).data.length - 1) : 0,
        total_spend: ((parsed as { data?: unknown[][] })?.data || []).slice(1).reduce((s, r) => s + Number(r[1] ?? 0), 0),
        raw_preview: txt.slice(0, 500),
      },
    });
  } catch (err) {
    results.push({ test: "google_us", ok: false, error: String(err) });
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    api_key_present: !!apiKey,
    api_key_prefix: apiKey?.slice(0, 8),
    results,
  });
}

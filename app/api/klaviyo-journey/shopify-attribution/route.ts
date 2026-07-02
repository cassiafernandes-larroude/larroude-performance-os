// Vercel Edge Function — atribuição Klaviyo via Shopify (BigQuery REST API)
// Filtra utm_source=klaviyo no landing_site. Auth via JWT assinado com SA private_key.
// Cassia 2026-07-02: migrado de larroude-data-platform.shopify_* (warehouse errado, SEM filtro
// DTC — contava B2B/teste/canceladas) para larroude-data-prod.stg_shopify(_br).orders com os
// filtros DTC canônicos (dtcCoreFilters) + mês na timezone do mercado.

import { dtcCoreFilters } from '@/lib/shared/dtc-filters';

export const runtime = 'edge';

const TZ: Record<string, string> = { us: 'America/New_York', br: 'America/Sao_Paulo' };

const BQ_PROJECT_FALLBACK = "larroude-data-platform";

// === JWT signing (Edge runtime — usa crypto.subtle) ===
function base64UrlEncode(input) {
  let str;
  if (typeof input === "string") str = btoa(input);
  else {
    const bytes = new Uint8Array(input);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    str = btoa(bin);
  }
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken = null;
let cachedTokenExp = 0;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExp > now + 60) return cachedToken;

  const b64 = process.env.GCP_SA_KEY_BASE64;
  if (!b64) throw new Error("GCP_SA_KEY_BASE64 não configurado");
  const sa = JSON.parse(atob(b64));

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const signingInput = header + "." + payload;

  const keyBuf = pemToArrayBuffer(sa.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = signingInput + "." + base64UrlEncode(sigBuf);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + encodeURIComponent(jwt)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("OAuth " + res.status + ": " + t.slice(0, 200));
  }
  const j = await res.json();
  cachedToken = j.access_token;
  cachedTokenExp = now + (j.expires_in || 3600);
  return cachedToken;
}

async function runBQQuery(projectId, sql, params) {
  const token = await getAccessToken();
  const body = {
    query: sql,
    useLegacySql: false,
    parameterMode: "NAMED",
    queryParameters: Object.entries(params || {}).map(([name, value]) => ({
      name,
      parameterType: { type: typeof value === "number" ? "INT64" : "STRING" },
      parameterValue: { value: String(value) }
    })),
    location: "US",
    timeoutMs: 12000
  };
  const res = await fetch("https://bigquery.googleapis.com/bigquery/v2/projects/" + encodeURIComponent(projectId) + "/queries", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("BQ " + res.status + ": " + t.slice(0, 250));
  }
  return await res.json();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const account = (url.searchParams.get("account") || "us").toLowerCase();
    const monthStr = url.searchParams.get("month") || "";

    if (!["us", "br"].includes(account)) {
      return new Response(JSON.stringify({ error: "account inválida (us|br)" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    let year, month;
    if (/^\d{4}-\d{2}$/.test(monthStr)) {
      const parts = monthStr.split("-").map(Number);
      year = parts[0]; month = parts[1];
    } else {
      const now = new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
    }
    const pad = n => String(n).padStart(2, "0");
    const startDate = year + "-" + pad(month) + "-01";
    const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    const endDate = next.y + "-" + pad(next.m) + "-01";

    const market = account === "br" ? "BR" : "US";
    const tz = TZ[account];
    const table = "larroude-data-prod.stg_shopify" + (account === "br" ? "_br" : "") + ".orders";
    const sql =
      "SELECT" +
      "  COUNT(*) AS total_orders," +
      "  IFNULL(ROUND(SUM(CAST(total_price AS FLOAT64)), 2), 0) AS total_revenue," +
      "  COUNTIF(REGEXP_CONTAINS(IFNULL(landing_site, ''), r'(?i)[?&]utm_source=klaviyo')) AS klaviyo_orders," +
      "  IFNULL(ROUND(SUM(IF(REGEXP_CONTAINS(IFNULL(landing_site, ''), r'(?i)[?&]utm_source=klaviyo'), CAST(total_price AS FLOAT64), 0)), 2), 0) AS klaviyo_revenue," +
      "  ANY_VALUE(currency) AS currency " +
      "FROM `" + table + "` " +
      "WHERE DATE(created_at, '" + tz + "') >= DATE(@start_date) AND DATE(created_at, '" + tz + "') < DATE(@end_date)" +
      "  AND financial_status NOT IN ('voided','refunded') " +
      dtcCoreFilters(market);

    const projectId = process.env.GCP_PROJECT_ID || BQ_PROJECT_FALLBACK;
    const j = await runBQQuery(projectId, sql, { start_date: startDate, end_date: endDate });

    if (!j.jobComplete) {
      throw new Error("BQ query não completou em 12s");
    }
    const row = (j.rows && j.rows[0] && j.rows[0].f) || [];
    const fields = (j.schema && j.schema.fields) || [];
    const getVal = name => {
      const idx = fields.findIndex(f => f.name === name);
      return idx >= 0 ? row[idx].v : null;
    };
    const totalOrders = Number(getVal("total_orders")) || 0;
    const totalRevenue = Number(getVal("total_revenue")) || 0;
    const klaviyoOrders = Number(getVal("klaviyo_orders")) || 0;
    const klaviyoRevenue = Number(getVal("klaviyo_revenue")) || 0;
    const attributionPct = totalRevenue > 0 ? (klaviyoRevenue / totalRevenue * 100) : 0;

    return new Response(JSON.stringify({
      account, year, month,
      monthKey: year + "-" + pad(month),
      totalOrders, totalRevenue,
      klaviyoOrders, klaviyoRevenue,
      attributionPct: Number(attributionPct.toFixed(2)),
      currency: getVal("currency") || (account === "br" ? "BRL" : "USD"),
      source: "bigquery-rest",
      fetchedAt: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": totalOrders > 0 ? "public, s-maxage=604800, stale-while-revalidate=86400" : "public, s-maxage=300"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e.message || String(e),
      fetchedAt: new Date().toISOString()
    }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, s-maxage=60" }
    });
  }
}

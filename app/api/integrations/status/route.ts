import { NextResponse } from "next/server";

const REQUIRED_VARS: Record<string, string[]> = {
  bigquery: ["GCP_SA_KEY_BASE64"],
  meta: ["META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET"],
  shopify_us: ["SHOPIFY_US_STORE_DOMAIN", "SHOPIFY_US_ADMIN_API_TOKEN"],
  shopify_br: ["SHOPIFY_BR_STORE_DOMAIN", "SHOPIFY_BR_ADMIN_API_TOKEN"],
  google_ads: ["GADS_DEVELOPER_TOKEN", "GADS_CLIENT_ID", "GADS_CLIENT_SECRET", "GADS_REFRESH_TOKEN"],
  klaviyo_us: ["KLAVIYO_PRIVATE_API_KEY_US"],
  klaviyo_br: ["KLAVIYO_PRIVATE_API_KEY_BR"],
  supermetrics: ["SUPERMETRICS_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
};

export async function GET() {
  const status: Record<string, { configured: boolean; missing: string[] }> = {};
  for (const [k, vars] of Object.entries(REQUIRED_VARS)) {
    const missing = vars.filter((v) => !process.env[v]);
    status[k] = { configured: missing.length === 0, missing };
  }
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    integrations: status,
  });
}

import { Database, CheckCircle2, XCircle, Clock, Megaphone, ShoppingBag, Mail, Search, Cpu, Sparkles, ShieldCheck, Globe, Calculator, Filter, DollarSign, AlertTriangle } from "lucide-react";
import { headers } from "next/headers";

export const revalidate = 300;

type Status = "ok" | "partial" | "missing";

type Source = {
  name: string;
  status: Status;
  desc: string;
  envVars: string[];
  iconCategory: "bq" | "meta" | "shopify" | "klaviyo" | "google" | "ai" | "tool";
  notes?: string;
};

type TableRow = {
  project: string;
  dataset: string;
  table: string;
  region: string;
  usedIn: string;
  lastModifiedIso: string | null;
  lastDayData: string | null;
  rowCount: number | null;
  sizeMb: number | null;
};

function check(...envs: string[]): Status {
  const set = envs.filter((e) => !!process.env[e]);
  if (set.length === envs.length) return "ok";
  if (set.length > 0) return "partial";
  return "missing";
}

const ICONS: Record<Source["iconCategory"], React.ReactNode> = {
  bq: <Database className="w-4 h-4" />,
  meta: <Megaphone className="w-4 h-4" />,
  shopify: <ShoppingBag className="w-4 h-4" />,
  klaviyo: <Mail className="w-4 h-4" />,
  google: <Search className="w-4 h-4" />,
  ai: <Sparkles className="w-4 h-4" />,
  tool: <Cpu className="w-4 h-4" />,
};

async function fetchTablesFreshness(): Promise<TableRow[]> {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "https";
    const url = `${proto}://${host}/api/fontes/tables-freshness`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return j.tables || [];
  } catch {
    return [];
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
    hour12: false,
  }) + " BRT";
}

function freshnessBadge(iso: string | null): { label: string; color: string } {
  if (!iso) return { label: "—", color: "var(--ink-muted)" };
  const hours = (Date.now() - new Date(iso).getTime()) / 1000 / 3600;
  if (hours < 24) return { label: "Fresh (<24h)", color: "var(--positive)" };
  if (hours < 48) return { label: "1d old", color: "var(--warning)" };
  if (hours < 24 * 7) return { label: `${Math.round(hours / 24)}d old`, color: "var(--warning)" };
  return { label: `${Math.round(hours / 24)}d old`, color: "var(--negative)" };
}

export default async function FontesPage() {
  const tables = await fetchTablesFreshness();

  const sections: Array<{ title: string; sources: Source[] }> = [
    {
      title: "Analytics (source of truth)",
      sources: [
        {
          name: "BigQuery - larroude-data-prod",
          status: check("GCP_SA_KEY_BASE64"),
          desc: "Service Account JSON (base64) with BigQuery Data Viewer + Job User",
          envVars: ["GCP_PROJECT_ID", "GCP_SA_KEY_BASE64"],
          iconCategory: "bq",
          notes: "Primary datasets: stg_shopify, stg_shopify_br, gold, gold_sales",
        },
      ],
    },
    {
      title: "Paid Media - Meta Ads",
      sources: [
        {
          name: "Meta App credentials",
          status: check("META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET"),
          desc: "Long-lived access token + App ID + App Secret",
          envVars: ["META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET"],
          iconCategory: "meta",
          notes: "Token expires in 60 days - currently using Supermetrics fallback",
        },
        {
          name: "Meta US - Larroude",
          status: "ok",
          desc: "act_2047856822417350 - regular US campaigns",
          envVars: ["META_US_MAIN_ACCOUNT_ID"],
          iconCategory: "meta",
        },
        {
          name: "Meta US - Pre-Order",
          status: "ok",
          desc: "act_929449929417505 - pre-sale US campaigns",
          envVars: ["META_US_PREORDER_ACCOUNT_ID"],
          iconCategory: "meta",
        },
        {
          name: "Meta US - Larroude New",
          status: "ok",
          desc: "act_312869193575906 - new US ad account",
          envVars: ["META_US_NEW_ACCOUNT_ID"],
          iconCategory: "meta",
        },
        {
          name: "Meta BR - Principal",
          status: "ok",
          desc: "act_1735567560524487 - Larroude Brasil",
          envVars: ["META_BR_ACCOUNT_PRINCIPAL"],
          iconCategory: "meta",
          notes: "Reports in USD - META_USD_TO_BRL multiplier applied in code",
        },
      ],
    },
    {
      title: "Paid Media - Google",
      sources: [
        {
          name: "Google Ads API",
          status: check("GADS_DEVELOPER_TOKEN", "GADS_CLIENT_ID", "GADS_CLIENT_SECRET", "GADS_REFRESH_TOKEN"),
          desc: "Developer Token + OAuth (client_id, secret, refresh)",
          envVars: ["GADS_DEVELOPER_TOKEN", "GADS_CLIENT_ID", "GADS_CLIENT_SECRET", "GADS_REFRESH_TOKEN", "GADS_CUSTOMER_ID"],
          iconCategory: "google",
          notes: "Using Supermetrics fallback - direct API integration pending OAuth flow",
        },
        {
          name: "Google Merchant Center US",
          status: check("GMC_ID_US"),
          desc: "ID 5747976495 - US product catalog",
          envVars: ["GMC_ID_US"],
          iconCategory: "google",
        },
        {
          name: "Google PageSpeed Insights",
          status: check("PAGESPEED_API_KEY"),
          desc: "Lighthouse scores + Core Web Vitals - used in Site Performance",
          envVars: ["PAGESPEED_API_KEY"],
          iconCategory: "google",
        },
      ],
    },
    {
      title: "E-commerce - Shopify",
      sources: [
        {
          name: "Shopify US - Admin API",
          status: check("SHOPIFY_US_STORE_DOMAIN", "SHOPIFY_US_ADMIN_API_TOKEN"),
          desc: "larroude-com.myshopify.com",
          envVars: ["SHOPIFY_US_STORE_DOMAIN", "SHOPIFY_US_ADMIN_API_TOKEN"],
          iconCategory: "shopify",
          notes: "Orders, customers, products, abandoned checkouts, inventory",
        },
        {
          name: "Shopify BR - Admin API",
          status: check("SHOPIFY_BR_STORE_DOMAIN", "SHOPIFY_BR_ADMIN_API_TOKEN"),
          desc: "larroude-brasil.myshopify.com",
          envVars: ["SHOPIFY_BR_STORE_DOMAIN", "SHOPIFY_BR_ADMIN_API_TOKEN"],
          iconCategory: "shopify",
        },
      ],
    },
    {
      title: "CRM - Klaviyo",
      sources: [
        {
          name: "Klaviyo US",
          status: check("KLAVIYO_PRIVATE_API_KEY_US"),
          desc: "pk_QY3GmW_... - flows, campaigns, segments US",
          envVars: ["KLAVIYO_PRIVATE_API_KEY_US"],
          iconCategory: "klaviyo",
          notes: "Powers Klaviyo Journey + Klaviyo CRM",
        },
        {
          name: "Klaviyo BR",
          status: check("KLAVIYO_PRIVATE_API_KEY_BR"),
          desc: "pk_U6TmNp_... - flows, campaigns, segments BR",
          envVars: ["KLAVIYO_PRIVATE_API_KEY_BR"],
          iconCategory: "klaviyo",
        },
      ],
    },
    {
      title: "Auxiliary connectors",
      sources: [
        {
          name: "Supermetrics",
          status: check("SUPERMETRICS_API_KEY"),
          desc: "Fallback for Meta + Google when direct API unavailable",
          envVars: ["SUPERMETRICS_API_KEY", "SUPERMETRICS_KEY_AD"],
          iconCategory: "tool",
          notes: "Per CLAUDE.md: direct APIs first, Supermetrics as fallback",
        },
      ],
    },
    {
      title: "AI",
      sources: [
        {
          name: "Anthropic API",
          status: check("ANTHROPIC_API_KEY"),
          desc: "Claude Opus/Sonnet for diagnostics + narrative + Ask Claude",
          envVars: ["ANTHROPIC_API_KEY"],
          iconCategory: "ai",
        },
      ],
    },
  ];

  const allSources = sections.flatMap((s) => s.sources);
  const counts = {
    ok: allSources.filter((s) => s.status === "ok").length,
    partial: allSources.filter((s) => s.status === "partial").length,
    missing: allSources.filter((s) => s.status === "missing").length,
  };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>
          Data Sources &amp; Rules
        </h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
          {counts.ok} of {allSources.length} integrations connected · BigQuery is the primary source · business + calculation rules below
        </p>
        <div className="flex items-center gap-3 mt-3">
          <span className="badge" style={{ background: "var(--positive-soft)", color: "var(--positive)" }}>
            {counts.ok} connected
          </span>
        </div>
      </div>

      {/* === Business Rules === */}
      <section className="mb-10">
        <div className="section-marker mb-3">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
          >
            Business rules applied across all dashboards
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {BUSINESS_RULES.map((rule) => (
            <RuleCard key={rule.title} rule={rule} />
          ))}
        </div>
        <p className="text-[10px] mt-3" style={{ color: "var(--ink-muted)" }}>
          Last audit: 2026-06-13 · Source: Obsidian REGRAS-LARROUDE-OS.md + code grep in <code>lib/</code>
        </p>
      </section>

      {/* === Calculation Rules === */}
      <section className="mb-10">
        <div className="section-marker mb-3">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
          >
            Calculation rules — KPI formulas used across dashboards
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {CALCULATION_RULES.map((calc) => (
            <CalculationCard key={calc.metric} calc={calc} />
          ))}
        </div>
      </section>

      {/* === BigQuery tables freshness table === */}
      {tables.length > 0 && (
        <section className="mb-10">
          <div className="section-marker mb-3">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
            >
              BigQuery tables &amp; freshness
            </span>
          </div>
          <div className="card overflow-x-auto" style={{ padding: 0 }}>
            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--paper)", borderBottom: "1px solid var(--border-soft)" }}>
                  <th className="text-left px-4 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Table</th>
                  <th className="text-left px-3 py-3 fontes-table-mobile-hide" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Region</th>
                  <th className="text-left px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Last modified</th>
                  <th className="text-left px-3 py-3 fontes-table-mobile-hide" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Last data</th>
                  <th className="text-right px-3 py-3 fontes-table-mobile-hide" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Rows</th>
                  <th className="text-right px-3 py-3 fontes-table-mobile-hide" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Size</th>
                  <th className="text-left px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                  <th className="text-left px-3 py-3 fontes-table-mobile-hide" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Used in</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => {
                  const fresh = freshnessBadge(t.lastModifiedIso);
                  return (
                    <tr key={`${t.project}.${t.dataset}.${t.table}`} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td className="px-4 py-3" style={{ color: "var(--ink)" }}>
                        <div style={{ fontWeight: 600 }}>{t.dataset}.{t.table}</div>
                        <div className="font-num" style={{ fontSize: 10, color: "var(--ink-muted)" }}>{t.project}</div>
                      </td>
                      <td className="px-3 py-3" style={{ color: "var(--ink-soft)" }}>{t.region}</td>
                      <td className="px-3 py-3 font-num" style={{ color: "var(--ink-soft)" }}>{formatDate(t.lastModifiedIso)}</td>
                      <td className="px-3 py-3 font-num" style={{ color: "var(--ink-soft)" }}>{t.lastDayData || "—"}</td>
                      <td className="px-3 py-3 text-right font-num" style={{ color: "var(--ink-soft)" }}>
                        {t.rowCount != null ? t.rowCount.toLocaleString("en-US") : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-num" style={{ color: "var(--ink-soft)" }}>
                        {t.sizeMb != null ? (t.sizeMb >= 1000 ? `${(t.sizeMb / 1024).toFixed(1)} GB` : `${t.sizeMb.toFixed(1)} MB`) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 100,
                          background: "var(--paper)",
                          color: fresh.color,
                          border: `1px solid ${fresh.color}`,
                          fontWeight: 600,
                        }}>
                          {fresh.label}
                        </span>
                      </td>
                      <td className="px-3 py-3" style={{ color: "var(--ink-muted)", fontSize: 11, maxWidth: 280 }}>{t.usedIn}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] mt-2" style={{ color: "var(--ink-muted)" }}>
            Live from BigQuery <code>INFORMATION_SCHEMA</code> on each page load. Times in São Paulo timezone.
          </p>
        </section>
      )}

      <div className="space-y-8">
        {sections
          .map((section) => ({ ...section, sources: section.sources.filter((s) => s.status === "ok") }))
          .filter((section) => section.sources.length > 0)
          .map((section) => (
            <section key={section.title}>
              <div className="section-marker mb-3">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
                >
                  {section.title}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {section.sources.map((s) => (
                  <SourceCard key={s.name} source={s} />
                ))}
              </div>
            </section>
          ))}
        {sections.flatMap((s) => s.sources).filter((s) => s.status === "ok").length === 0 && (
          <div className="card text-center py-12" style={{ color: "var(--ink-muted)" }}>
            <p className="text-[14px]">No sources connected yet. Configure env vars in Vercel to enable.</p>
          </div>
        )}
      </div>

    </div>
  );
}

// =====================================================================
// Business Rules — Performance OS
// Source: Obsidian REGRAS-LARROUDE-OS.md + auditoria do código em lib/
// =====================================================================

type Rule = {
  title: string;
  category: "filters" | "timezone" | "fx" | "ads" | "channels" | "metrics" | "data";
  desc: string;
  details: string[];
  appliesTo?: string;
};

const RULE_ICONS: Record<Rule["category"], React.ReactNode> = {
  filters: <Filter className="w-4 h-4" />,
  timezone: <Globe className="w-4 h-4" />,
  fx: <DollarSign className="w-4 h-4" />,
  ads: <Megaphone className="w-4 h-4" />,
  channels: <ShieldCheck className="w-4 h-4" />,
  metrics: <Calculator className="w-4 h-4" />,
  data: <Database className="w-4 h-4" />,
};

const BUSINESS_RULES: Rule[] = [
  {
    title: "B2B / wholesale exclusion",
    category: "filters",
    desc: "All orders tagged as B2B, wholesale, marketplace, redo or influencer are excluded from every metric.",
    details: [
      "Tested in BOTH order.tags AND customer.tags (JSON)",
      "Regex: b2b | wholesale | marketplace | redo | influencer",
      "Coverage validated 2026-06-13: US 51 orders / 90d, BR 6 orders / 90d",
    ],
    appliesTo: "Main, Overview, CAC, LTV, Channel Share, Executive, Apostar, UE, Klaviyo CRM, Shopify",
  },
  {
    title: "Order value cap (atacado outliers)",
    category: "filters",
    desc: "Orders above the cap are treated as wholesale and excluded from DTC metrics.",
    details: [
      "US: total_price > $30,000",
      "BR: total_price > R$25,000",
    ],
    appliesTo: "Main, CAC, LTV, Channel Share",
  },
  {
    title: "REDO (exchanges) — handling",
    category: "filters",
    desc: "Orders tagged REDO are exchanges (refund + new order). They get special treatment per dashboard.",
    details: [
      "Tag 'redo' in BOTH order.tags and customer.tags excludes from B2B-style filters (above)",
      "In Unit Economics: counted SEPARATELY as 'Exchange' (not Return) — different KPI",
      "In Products to Bet On: Exchange-Only orders REMOVED from volume base (Cassia 2026-06-12)",
      "Exchange cost (30d) = COGS of replacement units = exchangeCostPerUnit in UE",
      "Distinguished from Return: Return = refund without replacement; Exchange = refund WITH new order",
    ],
    appliesTo: "UE (Exchange Rate, Exchange Cost), Apostar (score), Main (Net Sales)",
  },
  {
    title: "PIX (BR) - exclude pending",
    category: "filters",
    desc: "Brazilian PIX orders that were never paid are excluded from gross sales.",
    details: [
      "Filter: financial_status NOT IN ('voided','refunded','pending')",
      "Reason: Shopify creates the order on intent, status only flips after the customer pays",
    ],
    appliesTo: "Main (BR), Overview (BR), Channel Share (BR)",
  },
  {
    title: "Market timezone",
    category: "timezone",
    desc: "Each market computes 'today/yesterday' in its own timezone.",
    details: [
      "US → America/New_York",
      "BR → America/Sao_Paulo",
      "All DATE(created_at, tz) casts respect the market",
    ],
    appliesTo: "Every dashboard with date filters",
  },
  {
    title: "FX BRL → USD conversion",
    category: "fx",
    desc: "BR values converted to USD using monthly average exchange rate from BigQuery.",
    details: [
      "Source: larroude-data-prod.gold.fx_rates_monthly",
      "Updated monthly · current month always in the table",
      "Used in: Executive (Consolidated USD+BR), LTV global, CAC global",
    ],
  },
  {
    title: "Meta Ads — US (3 accounts)",
    category: "ads",
    desc: "Three ad accounts combined for US, all reported in USD.",
    details: [
      "act_2047856822417350 — Larroude principal",
      "act_929449929417505 — Pre-Order campaigns",
      "act_312869193575906 — Larroude New",
      "Manual adjustment: +$400k in September/2025 (gap fill)",
    ],
    appliesTo: "Main, Overview, CAC, Channel Share",
  },
  {
    title: "Meta Ads — BR (USD reporting)",
    category: "ads",
    desc: "Single account act_1735567560524487, reports in USD, converted to BRL via FX.",
    details: [
      "META_USD_TO_BRL multiplier applied in code (lib/main-dashboard/meta-ads.ts)",
    ],
    appliesTo: "Main BR, Channel Share BR",
  },
  {
    title: "Meta access token fallback",
    category: "ads",
    desc: "When META_ACCESS_TOKEN expires (currently expired), system auto-falls back to Supermetrics.",
    details: [
      "Detection: Meta Graph API returns 401 OR query path errors",
      "Fallback: queryMetaAdsTotalViaSupermetrics() in lib/data/metrics.ts",
      "Renewal needed every ~60 days",
    ],
  },
  {
    title: "Google Ads — via Supermetrics",
    category: "ads",
    desc: "Direct Google Ads API integration pending OAuth refresh. Currently uses Supermetrics fallback ALWAYS.",
    details: [
      "queryGoogleAdsTotalViaSupermetrics() in lib/main-dashboard/queries.ts",
      "GADS_REFRESH_TOKEN still empty in .env",
    ],
    appliesTo: "Main, CAC, Channel Share",
  },
  {
    title: "Channel classification — DTC organic",
    category: "channels",
    desc: "Klaviyo/SMS/Awin/ShopMy are NOT paid channels.",
    details: [
      "Klaviyo (email) → owned media (tracked in tools cost only)",
      "SMS/Attentive → owned media",
      "Awin/ShopMy → affiliate (not paid ads)",
      "Organic Search + Organic Social consolidated as 'Orgânico'",
    ],
    appliesTo: "Main, Channel Share, Executive",
  },
  {
    title: "Channel costs — full list (REGRA CANÔNICA)",
    category: "channels",
    desc: "Cassia 2026-06-14 — TOTAL SPEND inclui todos os canais abaixo em TODOS os dashboards (Main, Overview, CAC, LTV, NorthStar, Consolidated). Fórmula única via lib/channel-costs-bq.ts → computeTotalSpend().",
    details: [
      "Meta Ads — Meta Graph API direta (PRIMARY) + Supermetrics fallback + ajuste manual Set/25 +$400k US",
      "Google Ads — Supermetrics queryGoogleAdsTotalViaSupermetrics",
      "Klaviyo (Email) — US $11.323/mo · BR R$13.000/mo (Jun/25–Mai/26)",
      "Attentive (SMS, US only) — variável: Jan/26 $26.413 → Mai/26 $13.330",
      "Criteo (Ads) — US $15.000/mo · BR R$50.000/mo (Jun/25–Mai/26)",
      "Agent.shop (BR Affiliate) — 10% receita atribuída via utm_source=agent-shop",
      "Awin (US+BR Affiliate) — 10% receita atribuída via utm_source=awin",
      "ShopMy (US Creator) — 10% receita atribuída via utm_source=shopmy",
      "Fixed tools são distribuídos linearmente por dia no range; % receita roda query BQ no Shopify orders.",
    ],
    appliesTo: "Overview, Main, CAC, LTV, NorthStar, Consolidated, Channel Share",
  },
  {
    title: "UTM patterns por canal — fonte de verdade",
    category: "channels",
    desc: "Patterns descobertos via SELECT direto no BigQuery stg_shopify[_br].orders — NÃO chutar. Match em landing_site OU referring_site (case-insensitive).",
    details: [
      "Awin       → utm_source=awin",
      "ShopMy     → utm_source=shopmy",
      "Agent.shop → utm_source=agent-shop  (com hífen — BR apenas)",
      "Klaviyo    → utm_source=klaviyo",
      "Attentive  → utm_source=attentive | utm_medium=sms",
      "Meta Ads   → utm_source=(meta|facebook|ig_paid|...) com utm_medium=cpc/cpm/paid",
      "Google Ads → utm_source=google + utm_medium=cpc | gclid=",
      "Criteo     → 'criteo' em landing_site ou referring_site",
      "Fonte: lib/shared/channel-utms.ts (constante central reusada em todas queries)",
    ],
    appliesTo: "All dashboards — classificação de receita E cálculo de custo %",
  },
  {
    title: "Spend total — fórmula única (computeTotalSpend)",
    category: "metrics",
    desc: "Cassia 2026-06-14 — todo cálculo de spend total em qualquer dashboard DEVE usar lib/channel-costs-bq.ts → computeTotalSpend(market, start, end, metaSpend, googleSpend). Garante números 100% idênticos entre Main / Overview / CAC / LTV / NorthStar / Consolidated.",
    details: [
      "TOTAL SPEND = Meta + Google + Klaviyo + Attentive + Criteo + Agent.shop + Awin + ShopMy",
      "Fixed tools (Klaviyo/Attentive/Criteo): distribuídos linearmente por dia no range",
      "% receita (Agent.shop/Awin/ShopMy): query no Shopify orders por UTM real, aplica 10%",
      "ROAS = Total Sales / Total Spend (sempre com tools+%revenue, não só Meta+Google)",
      "CAC = Total Spend / Novos Clientes (mesma fórmula em todos dashboards)",
    ],
    appliesTo: "All dashboards",
  },
  {
    title: "Net Sales = Gross - Returns",
    category: "metrics",
    desc: "Returns are subtracted at the gold_sales layer.",
    details: [
      "Source: larroude-data-prod.gold_sales.returns_daily",
      "Lag: D-2 (returns processed with delay)",
    ],
    appliesTo: "Main (Net Sales card)",
  },
  {
    title: "Today (D0) — Shopify Admin direct",
    category: "data",
    desc: "BigQuery pipeline has D-1 lag. Today's data fetched directly from Shopify Admin GraphQL.",
    details: [
      "Overview Today button → lib/shopify-today.ts",
      "Meta D0 → Graph API live (fallback Supermetrics)",
      "Google D0 → Supermetrics live",
    ],
    appliesTo: "Overview, UE Today, Apostar Today",
  },
  {
    title: "Chart-KPI parity",
    category: "metrics",
    desc: "Daily chart must always sum to the aggregated KPI for the same period.",
    details: [
      "Manual adjustments (Meta +$400k Set/25) applied in BOTH daily and aggregated queries",
      "Enforced via REGRAS-LARROUDE-OS.md §3",
    ],
    appliesTo: "Main Dashboard, CAC, LTV",
  },
  {
    title: "BigQuery source of truth",
    category: "data",
    desc: "All historical metrics use larroude-data-prod (not legacy data-platform).",
    details: [
      "Primary datasets: stg_shopify, stg_shopify_br, gold, gold_sales",
      "Legacy data-platform: still used only for unite_economics_* (CAC legacy) and gold_marketing.fct_ads_spend_daily (Google spend)",
    ],
  },
  {
    title: "Cache strategy",
    category: "data",
    desc: "In-memory cache to avoid hammering BigQuery on every page load.",
    details: [
      "30 min: common queries (lib/cache.ts)",
      "6 h: rolling historical aggregations",
      "12 h: Klaviyo reports (warmed via /api/klaviyo/cron/warm at 11h UTC)",
    ],
  },
  {
    title: "Klaviyo Placed Order metric",
    category: "metrics",
    desc: "Revenue attribution to email uses the Klaviyo 'Placed Order' metric, dynamically resolved.",
    details: [
      "Each account (US/BR) has its own metric ID",
      "Resolution cached per session in lib/klaviyo/queries.ts",
    ],
    appliesTo: "Klaviyo Journey, Klaviyo CRM",
  },
  {
    title: "Apostar score formula",
    category: "metrics",
    desc: "Score based on 28d performance minus exchanges, no longer counting Exchange-Only orders.",
    details: [
      "score = (gross_sales_28d - exchange_volume_28d) × margin × velocity",
      "Exchange-Only orders excluded entirely from volume base",
      "Cassia 2026-06-12: removed Exchange rule from score formula",
    ],
    appliesTo: "Products to Bet On",
  },
];

// =====================================================================
// Calculation Rules — formulas used to compute every KPI
// =====================================================================

type Calculation = {
  metric: string;
  formula: string;
  numerator?: string;
  denominator?: string;
  notes?: string[];
  appliesTo?: string;
  group: "revenue" | "ads" | "funnel" | "email" | "product" | "customer";
};

const CALC_GROUP_LABEL: Record<Calculation["group"], string> = {
  revenue: "Revenue",
  ads: "Paid media",
  funnel: "Funnel",
  email: "Email",
  product: "Product",
  customer: "Customer",
};

const CALC_GROUP_COLOR: Record<Calculation["group"], string> = {
  revenue: "#16a34a",
  ads: "#ec4899",
  funnel: "#2563eb",
  email: "#a855f7",
  product: "#f97316",
  customer: "#0891b2",
};

const CALCULATION_RULES: Calculation[] = [
  {
    metric: "Gross Sales",
    formula: "SUM(total_price) where filters apply",
    notes: [
      "Excludes B2B/wholesale/marketplace/redo/influencer",
      "Excludes orders > $30k US / R$25k BR",
      "Excludes PIX pending (BR)",
      "Excludes financial_status IN ('voided','refunded')",
    ],
    appliesTo: "Overview, Main, Channel Share, Executive",
    group: "revenue",
  },
  {
    metric: "Net Sales",
    formula: "Gross Sales − Returns",
    notes: [
      "Returns from larroude-data-prod.gold_sales.returns_daily",
      "Lag: D-2 (returns processed with delay)",
    ],
    appliesTo: "Main Dashboard (Net Sales card)",
    group: "revenue",
  },
  {
    metric: "Total Sales (for ROAS)",
    formula: "Gross Sales + tax + shipping",
    notes: ["Used as numerator in ROAS calculation (not Order Sales)"],
    appliesTo: "Overview, Main, CAC, Channel Share, Consolidated",
    group: "revenue",
  },
  {
    metric: "AOV — Average Order Value",
    formula: "Total Revenue ÷ Total Orders",
    numerator: "Gross Sales",
    denominator: "COUNT(DISTINCT order_id)",
    appliesTo: "Overview, Main, LTV, UE",
    group: "revenue",
  },
  {
    metric: "Total Spend",
    formula: "Σ (Meta + Google + Klaviyo + Attentive + Criteo + Agent.shop)",
    notes: [
      "Meta: 3 US accounts + BR (USD reporting × FX)",
      "Google: via Supermetrics (OAuth pending)",
      "Tools cost: monthly fixed (US Klaviyo $11,323 · BR Klaviyo R$13,000 · BR Agent.shop = 10% of revenue)",
    ],
    appliesTo: "Overview, Main, CAC, Channel Share",
    group: "ads",
  },
  {
    metric: "ROAS",
    formula: "Total Sales ÷ Total Spend",
    numerator: "Gross Sales + tax + shipping",
    denominator: "Σ all paid + tools cost",
    notes: ["Changed 2026-05-25 from 'Order Sales' to 'Total Sales' base"],
    appliesTo: "Overview, Main, Channel Share, Consolidated",
    group: "ads",
  },
  {
    metric: "CAC — Customer Acquisition Cost",
    formula: "Total Spend ÷ New Customers (in window)",
    numerator: "Σ Meta + Google + Klaviyo + Attentive + Criteo + Agent.shop (BR)",
    denominator: "COUNT(DISTINCT customer_id WHERE first_purchase_date = order_date)",
    notes: [
      "New customer detected via window function: MIN(created_at) per customer_id",
      "Source: lib/cac-dashboard/queries-bq.ts → queryDailyCac",
      "Daily chart must sum to aggregated CAC (paridade rule)",
      "Excludes B2B/wholesale/marketplace/redo/influencer + cap filters",
    ],
    appliesTo: "CAC Dashboard, Overview, Main",
    group: "customer",
  },
  {
    metric: "nCAC — Marketing-only CAC",
    formula: "Marketing Spend (paid ads only) ÷ New Customers",
    numerator: "Σ Meta + Google (excludes tools cost: Klaviyo, Attentive, Criteo)",
    denominator: "Same as CAC (new customers in window)",
    notes: ["Stricter than CAC — measures cost from paid acquisition channels only"],
    appliesTo: "CAC Dashboard",
    group: "customer",
  },
  {
    metric: "CRC — Cost to Retain Customer",
    formula: "Total Spend ÷ Returning Customers",
    denominator: "COUNT(DISTINCT customer_id WHERE first_purchase_date < order_date)",
    notes: ["Returning customer = had at least 1 previous order before the window"],
    appliesTo: "CAC Dashboard",
    group: "customer",
  },
  {
    metric: "CAC per SKU (allocation)",
    formula: "Σ allocatedSpend[sku] ÷ Σ newCustomers[sku]",
    notes: [
      "Spend allocated proportionally by SKU revenue share per day",
      "Used in CAC product heatmap and trend",
      "Source: lib/cac-dashboard/queries-bq.ts:294",
    ],
    appliesTo: "CAC Dashboard (product table)",
    group: "customer",
  },
  {
    metric: "CPO — Cost Per Order",
    formula: "Total Spend ÷ Total Orders",
    appliesTo: "Overview, Main, CAC",
    group: "ads",
  },
  {
    metric: "LTV Histórico (real)",
    formula: "total_net_sales ÷ total_customers",
    numerator: "Σ net_sales across ALL orders in window (no filter)",
    denominator: "COUNT(DISTINCT customer_id) in window",
    notes: [
      "What every customer has actually spent so far",
      "Uses NET sales (gross − returns)",
      "Default LTV exibido nos dashboards",
      "Source: lib/ltv-dashboard/queries.ts:18",
    ],
    appliesTo: "LTV Dashboard, Executive",
    group: "customer",
  },
  {
    metric: "LTV Preditivo (forecast)",
    formula: "AOV × Purchase Frequency × Customer Lifetime",
    notes: [
      "AOV = avg order value per customer",
      "Purchase Frequency = orders ÷ unique customers (window)",
      "Customer Lifetime = expected active months (proxy from BG/NBD model)",
      "Não reconcilia com planilha oficial Cassia desde mudança em maio/2026",
      "Source: lib/ltv-dashboard/queries.ts:6",
    ],
    appliesTo: "LTV Dashboard (preditivo card)",
    group: "customer",
  },
  {
    metric: "LTV Mediana / P75 / P90",
    formula: "Percentil de revenue per customer no window",
    notes: [
      "ltvMedian = APPROX_QUANTILES(revenue_per_customer, 100)[50]",
      "ltvP75 = ...[75]",
      "ltvP90 = ...[90]",
      "Mostra distribuição (top customers concentram receita)",
    ],
    appliesTo: "LTV Dashboard",
    group: "customer",
  },
  {
    metric: "LTV windowed (Klaviyo)",
    formula: "revenue ÷ uniqueBuyerMonths (L3M, L6M, L12M)",
    notes: [
      "Computed from Klaviyo Placed Order metric (uniques + sum_value)",
      "Forecast 3M = trailing 12m average × 3",
      "Source: public/klaviyo-journey/index.html (lib na api/data.js)",
    ],
    appliesTo: "Klaviyo Journey (LTV cards)",
    group: "customer",
  },
  {
    metric: "LTV / CAC ratio",
    formula: "LTV Histórico ÷ CAC",
    notes: [
      "Healthy threshold: > 3.0×",
      "Yellow: 1.5–3.0×",
      "Red: < 1.5×",
      "Excellent: > 5.0×",
    ],
    appliesTo: "LTV Dashboard, Executive, North Star",
    group: "customer",
  },
  {
    metric: "Purchase Frequency",
    formula: "Total Orders ÷ Unique Customers (in window)",
    notes: ["Used as one of the 3 components of LTV Preditivo"],
    appliesTo: "LTV Dashboard",
    group: "customer",
  },
  {
    metric: "Customer Lifetime (months)",
    formula: "Expected active months per customer",
    notes: [
      "Proxy via avg gap between orders + decay function",
      "Used as Lifetime factor in LTV Preditivo",
    ],
    appliesTo: "LTV Dashboard",
    group: "customer",
  },
  {
    metric: "CVR — Conversion Rate",
    formula: "Orders ÷ Sessions",
    notes: ["Sessions sourced from Shopify online store (referrer-based)"],
    appliesTo: "Main Dashboard (conversion funnel)",
    group: "funnel",
  },
  {
    metric: "CPC — Cost Per Click",
    formula: "Spend ÷ Clicks",
    notes: ["Sourced from Meta + Google ad-platform metrics"],
    appliesTo: "Main, Meta Ads, Google Ads",
    group: "ads",
  },
  {
    metric: "CTR — Click-Through Rate",
    formula: "Clicks ÷ Impressions",
    appliesTo: "Meta Ads, Google Ads",
    group: "ads",
  },
  {
    metric: "Conversion Funnel (Shopify)",
    formula: "Sessions → Added to cart → Checkout started → Orders",
    notes: [
      "Sessions: 1M+/period (was wrongly 16k in earlier version, fixed)",
      "Each stage % = stage ÷ previous stage",
    ],
    appliesTo: "Main Dashboard (Conversions by Step)",
    group: "funnel",
  },
  {
    metric: "Open Rate (email)",
    formula: "opens_unique ÷ delivered",
    notes: ["From Klaviyo campaign-values-report and flow-values-report"],
    appliesTo: "Klaviyo CRM, Klaviyo Journey",
    group: "email",
  },
  {
    metric: "Click Rate (email)",
    formula: "clicks_unique ÷ delivered",
    appliesTo: "Klaviyo CRM, Klaviyo Journey",
    group: "email",
  },
  {
    metric: "RPR — Revenue per Recipient",
    formula: "conversion_value ÷ recipients",
    notes: ["Klaviyo statistic from Placed Order conversion metric"],
    appliesTo: "Klaviyo CRM (Campaigns, Flows, Segments)",
    group: "email",
  },
  {
    metric: "Conversion Rate (email)",
    formula: "conversions ÷ recipients",
    appliesTo: "Klaviyo CRM",
    group: "email",
  },
  {
    metric: "Bounce Rate (email)",
    formula: "bounced ÷ delivered",
    notes: ["Hard + soft bounces aggregated"],
    appliesTo: "Klaviyo CRM (Health card)",
    group: "email",
  },
  {
    metric: "Return Rate (product)",
    formula: "Returns 30d ÷ Orders 30d (per product)",
    notes: ["Window: trailing 30 days from selected date"],
    appliesTo: "Unit Economics, Apostar",
    group: "product",
  },
  {
    metric: "Exchange Rate (product)",
    formula: "Exchanges 30d ÷ Orders 30d (per product)",
    notes: [
      "Exchange = refund where new order created (tag REDO)",
      "Distinct from Return (refund without replacement)",
    ],
    appliesTo: "Unit Economics, Apostar",
    group: "product",
  },
  {
    metric: "Gross Margin",
    formula: "(Revenue − COGS) ÷ Revenue",
    notes: ["COGS from product cost field (Shopify)"],
    appliesTo: "Unit Economics, Apostar",
    group: "product",
  },
  {
    metric: "Unit Economics",
    formula: "Price × (1 − discount) − COGS − Marketing − Returns_cost",
    notes: [
      "Base price = compareAtPrice (full price, not discount price)",
      "Marketing % from premissa editable in UE",
      "Returns_cost = REDO 30d cost per unit",
    ],
    appliesTo: "Unit Economics Dashboard",
    group: "product",
  },
  {
    metric: "Apostar Score",
    formula: "(Gross_sales_28d − Exchange_volume_28d) × Margin × Velocity",
    notes: [
      "Cassia 2026-06-12: removed standalone 'Exchange rule' from score",
      "Exchange-Only orders excluded entirely from volume base",
      "Velocity = orders ÷ days_with_inventory",
    ],
    appliesTo: "Products to Bet On",
    group: "product",
  },
  {
    metric: "Channel Share",
    formula: "Channel Revenue ÷ Total Revenue",
    notes: [
      "Organic Search + Organic Social → 'Orgânico'",
      "Klaviyo/SMS/Awin/ShopMy = NOT paid (owned/affiliate)",
    ],
    appliesTo: "Channel Share, Main, Executive",
    group: "ads",
  },
  {
    metric: "Period filter windows",
    formula: "L1D / L7D / L28D / 3M / 6M / 12M = trailing rolling",
    notes: [
      "L1D = today only",
      "L7D = trailing 7 days from yesterday (D-1 inclusive)",
      "All windows use market timezone (US: NY, BR: SP)",
    ],
    appliesTo: "Every dashboard with period filter",
    group: "funnel",
  },
];

function CalculationCard({ calc }: { calc: Calculation }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${CALC_GROUP_COLOR[calc.group]}` }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
          {calc.metric}
        </h3>
        <span
          style={{
            fontSize: 9,
            padding: "2px 8px",
            borderRadius: 100,
            background: CALC_GROUP_COLOR[calc.group] + "20",
            color: CALC_GROUP_COLOR[calc.group],
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {CALC_GROUP_LABEL[calc.group]}
        </span>
      </div>
      <div
        className="font-num"
        style={{
          fontSize: 12,
          padding: "8px 10px",
          background: "var(--paper)",
          borderRadius: 6,
          color: "var(--ink)",
          fontWeight: 600,
          marginBottom: 8,
          border: "1px solid var(--border-soft)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
      >
        {calc.formula}
      </div>
      {(calc.numerator || calc.denominator) && (
        <div className="text-[11px] mb-2" style={{ color: "var(--ink-muted)" }}>
          {calc.numerator && (
            <div>
              <b>numerator:</b> {calc.numerator}
            </div>
          )}
          {calc.denominator && (
            <div>
              <b>denominator:</b> {calc.denominator}
            </div>
          )}
        </div>
      )}
      {calc.notes && calc.notes.length > 0 && (
        <ul className="space-y-1 mb-2">
          {calc.notes.map((n, i) => (
            <li
              key={i}
              className="text-[11px] flex items-start gap-1.5"
              style={{ color: "var(--ink-muted)" }}
            >
              <span style={{ color: CALC_GROUP_COLOR[calc.group] }}>•</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
      {calc.appliesTo && (
        <p className="text-[10px] italic" style={{ color: "var(--ink-muted)" }}>
          Applies to: {calc.appliesTo}
        </p>
      )}
    </div>
  );
}

function RuleCard({ rule }: { rule: Rule }) {
  return (
    <div className="card flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--paper)", color: "var(--ink-muted)" }}
      >
        {RULE_ICONS[rule.category]}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-semibold mb-1" style={{ color: "var(--ink)" }}>
          {rule.title}
        </h3>
        <p className="text-[12px] mb-2" style={{ color: "var(--ink-soft)" }}>
          {rule.desc}
        </p>
        <ul className="space-y-1 mb-2">
          {rule.details.map((d, i) => (
            <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--ink-muted)" }}>
              <span style={{ color: "var(--positive, #16a34a)" }}>•</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
        {rule.appliesTo && (
          <p className="text-[10px] italic" style={{ color: "var(--ink-muted)" }}>
            Applies to: {rule.appliesTo}
          </p>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  const cfg = source.status === "ok"
    ? { icon: <CheckCircle2 className="w-5 h-5" />, color: "var(--positive)" }
    : source.status === "partial"
    ? { icon: <Clock className="w-5 h-5" />, color: "var(--warning)" }
    : { icon: <XCircle className="w-5 h-5" />, color: "var(--negative)" };

  return (
    <div className="card flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--paper)", color: "var(--ink-muted)" }}
      >
        {ICONS[source.iconCategory]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
            {source.name}
          </h3>
        </div>
        <p className="text-[12px] mb-2" style={{ color: "var(--ink-soft)" }}>
          {source.desc}
        </p>
        <div className="flex flex-wrap gap-1 mb-2">
          {source.envVars.map((env) => (
            <span
              key={env}
              className="font-num"
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--paper)",
                color: "var(--ink-muted)",
                border: "1px solid var(--border-soft)",
              }}
            >
              {env}
            </span>
          ))}
        </div>
        {source.notes && (
          <p className="text-[11px] italic" style={{ color: "var(--ink-muted)" }}>
            {source.notes}
          </p>
        )}
      </div>
    </div>
  );
}

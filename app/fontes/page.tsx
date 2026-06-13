import { Database, CheckCircle2, XCircle, Clock, Megaphone, ShoppingBag, Mail, Search, Cpu, Sparkles } from "lucide-react";
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
          Data Sources
        </h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
          {counts.ok} of {allSources.length} integrations connected · BigQuery is the primary source
        </p>
        <div className="flex items-center gap-3 mt-3">
          <span className="badge" style={{ background: "var(--positive-soft)", color: "var(--positive)" }}>
            {counts.ok} connected
          </span>
        </div>
      </div>

      {/* === NEW: BigQuery tables freshness table === */}
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
                  <th className="text-left px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Region</th>
                  <th className="text-left px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Last modified</th>
                  <th className="text-left px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Last data</th>
                  <th className="text-right px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Rows</th>
                  <th className="text-right px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Size</th>
                  <th className="text-left px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                  <th className="text-left px-3 py-3" style={{ color: "var(--ink-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Used in</th>
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

import { Database, CheckCircle2, XCircle, Clock, Megaphone, ShoppingBag, Mail, Search, Cpu, Sparkles } from "lucide-react";

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

export default function FontesPage() {
  const sections: Array<{ title: string; sources: Source[] }> = [
    {
      title: "Analytics (source of truth)",
      sources: [
        {
          name: "BigQuery - larroude-data-platform",
          status: check("GCP_SA_KEY_BASE64"),
          desc: "Service Account JSON (base64) with BigQuery Data Viewer + Job User role",
          envVars: ["GCP_PROJECT_ID", "GCP_SA_KEY_BASE64"],
          iconCategory: "bq",
          notes: "Datasets: shopify_us.orders, shopify_br.orders, gold_marketing.fct_ads_spend_daily, gold.unite_economics_*",
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
          notes: "Token expires in 60 days - refresh via API",
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
          notes: "GADS_REFRESH_TOKEN still pending - using BQ fallback until OAuth flow resolved",
        },
        {
          name: "Google Merchant Center US",
          status: check("GMC_ID_US"),
          desc: "ID 5747976495 - US product catalog",
          envVars: ["GMC_ID_US"],
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
          notes: "Admin API Token covers orders, customers, products, abandoned checkouts",
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
        },
        {
          name: "Klaviyo BR",
          status: check("KLAVIYO_PRIVATE_API_KEY_BR"),
          desc: "pk_U6TmNp_... - flows, campaigns, segments BR",
          envVars: ["KLAVIYO_PRIVATE_API_KEY_BR"],
          iconCategory: "klaviyo",
          notes: "Welcome Series BR outperforming fashion benchmark (CVR 4.2%)",
        },
      ],
    },
    {
      title: "Auxiliary connectors",
      sources: [
        {
          name: "Supermetrics",
          status: check("SUPERMETRICS_API_KEY"),
          desc: "Fallback for Meta + Google + Shopify when direct API unavailable",
          envVars: ["SUPERMETRICS_API_KEY", "SUPERMETRICS_KEY_AD"],
          iconCategory: "tool",
          notes: "Per CLAUDE.md: prioritize direct APIs, Supermetrics fallback only",
        },
      ],
    },
    {
      title: "AI - Ask Claude + narrative",
      sources: [
        {
          name: "Anthropic API",
          status: check("ANTHROPIC_API_KEY"),
          desc: "Claude Opus 4.6 for Ask Claude chat + daily narrative",
          envVars: ["ANTHROPIC_API_KEY"],
          iconCategory: "ai",
          notes: "Create key at console.anthropic.com/settings/keys",
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

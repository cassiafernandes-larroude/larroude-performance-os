"use client";

import { Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const titleMap: Record<string, string> = {
  "/": "Overview",
  "/north-star": "North Star",
  "/executive": "Executive View",
  "/dashboard-principal": "Main Dashboard",
  "/ltv-cohorts": "LTV",
  "/cac-ncac-crc": "CAC",
  "/klaviyo": "Klaviyo Journey",
  "/meta-ads": "Meta Ads",
  "/google-ads": "Google Ads",
  "/shopify": "Shopify",
  "/inventory": "Inventory Intelligence",
  "/site-performance": "Site Performance",
  "/diagnostics": "Diagnostics",
  "/anomalies": "Anomalies",
  "/cohort-analysis": "Cohort Analysis",
  "/ask-claude": "Ask Claude",
  "/glossario": "KPI Glossary",
  "/fontes": "Data Sources",
  "/alertas": "Alerts",
};

export function MobileHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const pathname = usePathname();
  const title = titleMap[pathname] || "Performance OS";

  return (
    <header
      className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 pt-safe"
      style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
    >
      <button onClick={onOpenSidebar} className="p-2 -ml-2 rounded-lg" style={{ color: "var(--ink)" }} aria-label="Open menu">
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 text-center">
        <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>Performance OS</div>
        <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{title}</div>
      </div>
      <Link href="/ask-claude" className="p-2 -mr-2 rounded-lg flex items-center gap-1" aria-label="Go to Ask Claude">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--pink)" }}>
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      </Link>
    </header>
  );
}
"use client";

import { Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const titleMap: Record<string, string> = {
  "/": "Overview",
  "/north-star": "North Star",
  "/executive": "Executive View",
  "/dashboard-principal": "Main Dashboard",
  "/ltv-cohorts": "LTV",
  "/cac-ncac-crc": "CAC",
  "/klaviyo": "Klaviyo Journey",
  "/meta-ads": "Meta Ads",
  "/google-ads": "Google Ads",
  "/shopify": "Shopify",
  "/site-performance": "Site Performance",
  "/diagnostics": "Diagnostics",
  "/anomalies": "Anomalies",
  "/cohort-analysis": "Cohort Analysis",
  "/ask-claude": "Ask Claude",
  "/glossario": "KPI Glossary",
  "/fontes": "Data Sources",
  "/alertas": "Alerts",
};

export function MobileHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const pathname = usePathname();
  const title = titleMap[pathname] || "Performance OS";

  return (
    <header
      className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 pt-safe"
      style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}
    >
      <button onClick={onOpenSidebar} className="p-2 -ml-2 rounded-lg" style={{ color: "var(--ink)" }} aria-label="Open menu">
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 text-center">
        <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>Performance OS</div>
        <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{title}</div>
      </div>
      <Link href="/ask-claude" className="p-2 -mr-2 rounded-lg flex items-center gap-1" aria-label="Go to Ask Claude">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--pink)" }}>
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      </Link>
    </header>
  );
}

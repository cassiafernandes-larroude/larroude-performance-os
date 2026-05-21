"use client";

import { Menu, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

const titleMap: Record<string, string> = {
  "/": "Daily Briefing",
  "/north-star": "North Star",
  "/executive": "Executive View",
  "/dashboard-principal": "Dashboard Principal",
  "/ltv-cohorts": "LTV · Cohorts",
  "/cac-ncac-crc": "CAC · nCAC · CRC",
  "/klaviyo": "Klaviyo CRM",
  "/meta-ads": "Meta Ads",
  "/google-ads": "Google Ads",
  "/shopify": "Shopify",
  "/pre-order": "Pré-Order Tracker",
  "/site-performance": "Site Performance",
  "/diagnostics": "Diagnósticos",
  "/anomalies": "Anomalias",
  "/cohort-analysis": "Cohort Analysis",
  "/ask-claude": "Ask Claude",
  "/glossario": "Glossário KPIs",
  "/fontes": "Fontes de Dados",
  "/alertas": "Alertas",
};

export function MobileHeader({
  onOpenSidebar,
  onOpenChat,
}: {
  onOpenSidebar: () => void;
  onOpenChat: () => void;
}) {
  const pathname = usePathname();
  const title = titleMap[pathname] || "Performance OS";

  return (
    <header
      className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 pt-safe"
      style={{
        background: "var(--paper)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        onClick={onOpenSidebar}
        className="p-2 -ml-2 rounded-lg"
        style={{ color: "var(--ink)" }}
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 text-center">
        <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
          Performance OS
        </div>
        <div
          className="text-[14px] font-semibold"
          style={{ color: "var(--ink)" }}
        >
          {title}
        </div>
      </div>
      <button
        onClick={onOpenChat}
        className="p-2 -mr-2 rounded-lg flex items-center gap-1"
        aria-label="Abrir Ask Claude"
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "var(--pink)" }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      </button>
    </header>
  );
}

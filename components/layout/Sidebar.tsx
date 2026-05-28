ï»¿"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  Target,
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  Users,
  Mail,
  Megaphone,
  Search,
  ShoppingBag,
  Package,
  Gauge,
  Microscope,
  Activity,
  GitCompare,
  MessageSquare,
  BookOpen,
  Database,
  Bell,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { href: "/", label: "Overview", icon: Sun },
      { href: "/north-star", label: "North Star", icon: Target },
      { href: "/executive", label: "Executive View", icon: LayoutDashboard },
    ],
  },
  {
    title: "DASHBOARDS",
    items: [
      { href: "/dashboard-principal", label: "Main Dashboard", icon: BarChart3 },
      { href: "/ltv-cohorts", label: "LTV", icon: TrendingUp },
      { href: "/cac-ncac-crc", label: "CAC", icon: Users },
      { href: "/klaviyo", label: "Klaviyo Journey", icon: Mail },
      { href: "/meta-ads", label: "Meta Ads", icon: Megaphone },
      { href: "/google-ads", label: "Google Ads", icon: Search },
      { href: "/shopify", label: "Shopify", icon: ShoppingBag },
      { href: "/inventory", label: "Inventory Intelligence", icon: Package },
      { href: "/site-performance", label: "Site Performance", icon: Gauge },
    ],
  },
  {
    title: "INTELLIGENCE",
    items: [
      { href: "/diagnostics", label: "Diagnostics", icon: Microscope, badge: "4" },
      { href: "/anomalies", label: "Anomalies", icon: Activity },
      { href: "/cohort-analysis", label: "Cohort Analysis", icon: GitCompare },
      { href: "/ask-claude", label: "Ask Claude", icon: MessageSquare },
    ],
  },
  {
    title: "CONFIG",
    items: [
      { href: "/glossario", label: "KPI Glossary", icon: BookOpen },
      { href: "/fontes", label: "Data Sources", icon: Database },
      { href: "/alertas", label: "Alerts", icon: Bell },
    ],
  },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`sidebar-drawer fixed lg:relative top-0 left-0 h-full w-[280px] lg:w-60 flex-shrink-0 flex flex-col z-50 lg:z-auto shadow-xl lg:shadow-none pt-safe pb-safe ${
        open ? "open" : ""
      }`}
      style={{
        background: "var(--paper-deep)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Brand */}
      <div className="px-5 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[20px]" style={{ color: "var(--ink)" }}>
              LarroudÃ©
            </span>
            <span style={{ color: "var(--ink-muted)" }}>Â·</span>
            <span
              className="text-[13px]"
              style={{ color: "var(--ink-soft)", fontWeight: 500 }}
            >
              OS
            </span>
          </div>
          <div
            className="text-[10px] mt-0.5"
            style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
          >
            PERFORMANCE Â· v0.1
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg"
          style={{ color: "var(--ink-muted)" }}
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 mb-3">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "white", border: "1px solid var(--border)" }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: "var(--ink-muted)" }} />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-[12px] flex-1 focus:outline-none"
            style={{ color: "var(--ink)" }}
          />
          <span
            className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded font-num"
            style={{ background: "var(--paper)", color: "var(--ink-muted)" }}
          >
            âK
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scroll-area px-3 space-y-5 pb-4">
        {navSections.map((section) => (
          <div key={section.title}>
            <div
              className="px-3 mb-1.5 text-[10px] font-semibold"
              style={{ color: "var(--ink-muted)", letterSpacing: "0.08em" }}
            >
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive ? "active" : ""}`}
                    onClick={onClose}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className="ml-auto text-[10px] font-num px-1.5 py-0.5 rounded"
                        style={{ background: "var(--pink)", color: "white" }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
</aside>
  );
}
﻿"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  Target,
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  Users,
  Mail,
  Megaphone,
  Search,
  ShoppingBag,
  Package,
  Gauge,
  Microscope,
  Activity,
  GitCompare,
  MessageSquare,
  BookOpen,
  Database,
  Bell,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { href: "/", label: "Overview", icon: Sun },
      { href: "/north-star", label: "North Star", icon: Target },
      { href: "/executive", label: "Executive View", icon: LayoutDashboard },
    ],
  },
  {
    title: "DASHBOARDS",
    items: [
      { href: "/dashboard-principal", label: "Main Dashboard", icon: BarChart3 },
      { href: "/ltv-cohorts", label: "LTV", icon: TrendingUp },
      { href: "/cac-ncac-crc", label: "CAC", icon: Users },
      { href: "/klaviyo", label: "Klaviyo Journey", icon: Mail },
      { href: "/meta-ads", label: "Meta Ads", icon: Megaphone },
      { href: "/google-ads", label: "Google Ads", icon: Search },
      { href: "/shopify", label: "Shopify", icon: ShoppingBag },
      { href: "/site-performance", label: "Site Performance", icon: Gauge },
    ],
  },
  {
    title: "INTELLIGENCE",
    items: [
      { href: "/diagnostics", label: "Diagnostics", icon: Microscope, badge: "4" },
      { href: "/anomalies", label: "Anomalies", icon: Activity },
      { href: "/cohort-analysis", label: "Cohort Analysis", icon: GitCompare },
      { href: "/ask-claude", label: "Ask Claude", icon: MessageSquare },
    ],
  },
  {
    title: "CONFIG",
    items: [
      { href: "/glossario", label: "KPI Glossary", icon: BookOpen },
      { href: "/fontes", label: "Data Sources", icon: Database },
      { href: "/alertas", label: "Alerts", icon: Bell },
    ],
  },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`sidebar-drawer fixed lg:relative top-0 left-0 h-full w-[280px] lg:w-60 flex-shrink-0 flex flex-col z-50 lg:z-auto shadow-xl lg:shadow-none pt-safe pb-safe ${
        open ? "open" : ""
      }`}
      style={{
        background: "var(--paper-deep)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Brand */}
      <div className="px-5 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[20px]" style={{ color: "var(--ink)" }}>
              Larroudé
            </span>
            <span style={{ color: "var(--ink-muted)" }}>·</span>
            <span
              className="text-[13px]"
              style={{ color: "var(--ink-soft)", fontWeight: 500 }}
            >
              OS
            </span>
          </div>
          <div
            className="text-[10px] mt-0.5"
            style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
          >
            PERFORMANCE · v0.1
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg"
          style={{ color: "var(--ink-muted)" }}
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 mb-3">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "white", border: "1px solid var(--border)" }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: "var(--ink-muted)" }} />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-[12px] flex-1 focus:outline-none"
            style={{ color: "var(--ink)" }}
          />
          <span
            className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded font-num"
            style={{ background: "var(--paper)", color: "var(--ink-muted)" }}
          >
            ⌘K
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scroll-area px-3 space-y-5 pb-4">
        {navSections.map((section) => (
          <div key={section.title}>
            <div
              className="px-3 mb-1.5 text-[10px] font-semibold"
              style={{ color: "var(--ink-muted)", letterSpacing: "0.08em" }}
            >
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive ? "active" : ""}`}
                    onClick={onClose}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className="ml-auto text-[10px] font-num px-1.5 py-0.5 rounded"
                        style={{ background: "var(--pink)", color: "white" }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
</aside>
  );
}

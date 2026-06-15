"use client";

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
  Factory,
  Gauge,
  Microscope,
  BookOpen,
  Database,
  Bell,
  PieChart,
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
      { href: "/executive", label: "Consolidated View", icon: LayoutDashboard },
    ],
  },
  {
    title: "DASHBOARDS",
    items: [
      { href: "/dashboard-principal", label: "Main Dashboard", icon: BarChart3 },
      { href: "/channel-share", label: "Channel Share", icon: PieChart },
      { href: "/ltv-native", label: "LTV", icon: TrendingUp },
      { href: "/cac-native", label: "CAC", icon: Users },
      { href: "/unit-economics", label: "Unit Economics", icon: Microscope },
      { href: "/produtos-apostar", label: "Products to Bet On", icon: Target },
      { href: "/klaviyo", label: "Klaviyo Journey", icon: Mail },
      { href: "/klaviyo-crm", label: "Klaviyo CRM", icon: Mail },
      { href: "/meta-ads", label: "Meta Ads", icon: Megaphone },
      { href: "/google-ads", label: "Google Ads", icon: Search },
      { href: "/shopify", label: "Shopify", icon: ShoppingBag },
      { href: "/inventory", label: "Inventory Intelligence", icon: Package },
      { href: "/producao", label: "Produção 2.0", icon: Factory },
      { href: "/site-performance", label: "Site Performance", icon: Gauge },
    ],
  },
  {
    title: "CONFIG",
    items: [
      { href: "/fontes", label: "Data Sources & Rules", icon: Database },
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
      <div className="px-5 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[20px]" style={{ color: "var(--ink)" }}>
              Larroude
            </span>
            <span style={{ color: "var(--ink-muted)" }}>-</span>
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
            PERFORMANCE - v0.1
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg"
          style={{ color: "var(--ink-muted)" }}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

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

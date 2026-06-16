"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Smartphone, Monitor } from "lucide-react";

export function StrategyToggle({ current }: { current: "mobile" | "desktop" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const set = (s: "mobile" | "desktop") => {
    const next = new URLSearchParams(params.toString());
    if (s === "mobile") next.delete("strategy");
    else next.set("strategy", "desktop");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-full" style={{ background: "var(--paper-deep)" }}>
      <button
        onClick={() => set("mobile")}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${current === "mobile" ? "" : "opacity-60"}`}
        style={current === "mobile" ? { background: "white", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" } : { color: "var(--ink-soft)" }}
      >
        <Smartphone className="w-3 h-3" />
        Mobile
      </button>
      <button
        onClick={() => set("desktop")}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${current === "desktop" ? "" : "opacity-60"}`}
        style={current === "desktop" ? { background: "white", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" } : { color: "var(--ink-soft)" }}
      >
        <Monitor className="w-3 h-3" />
        Desktop
      </button>
    </div>
  );
}

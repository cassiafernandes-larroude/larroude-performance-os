"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const [lastSync, setLastSync] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/site-performance/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLastSync(data.at);
      }
      startTransition(() => router.refresh());
    } finally {
      // pequeno delay para o spinner ficar visível antes do reload
      setTimeout(() => setLoading(false), 800);
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="pill pill-pink px-4 py-1.5 text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-60"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
      <span>{loading ? "Atualizando..." : "Atualizar agora"}</span>
    </button>
  );
}

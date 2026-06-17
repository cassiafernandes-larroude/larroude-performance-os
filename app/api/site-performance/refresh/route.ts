import { NextResponse } from "next/server";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST() {
  // Cassia 2026-06-17: corrige prefixo — a cache key real e' site-perf-v2: (lib/data/site-performance.ts).
  // Antes invalidava site-perf-v1: (inexistente), entao "Atualizar agora" nao tinha efeito.
  invalidate("site-perf-v2:");
  return NextResponse.json({ ok: true, invalidated: "site-perf-v2:*", at: new Date().toISOString() });
}

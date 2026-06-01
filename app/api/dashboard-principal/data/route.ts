// GET /api/data?market=US|BR&period=7d|14d|28d|3M|6M
// Retorna o DashboardPayload completo.
// Cache em memória (process-level) com TTL — apropriado para Vercel Serverless.

import { NextResponse } from 'next/server';
import { getDashboardPayload } from '@/lib/main-dashboard/dashboard-service';
import type { DashboardPayload, Market, PeriodKey } from '@/lib/main-dashboard/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type CacheEntry = { ts: number; data: DashboardPayload };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 3 * 60 * 60 * 1000; // 3h

function isValidMarket(m: any): m is Market { return m === 'US' || m === 'BR'; }
function isValidPeriod(p: any): p is PeriodKey { return ['7d', '14d', '28d', '3M', '6M', '12M'].includes(p); }
function isValidDate(s: any): boolean { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = url.searchParams.get('market') ?? 'US';
  const period = url.searchParams.get('period') ?? '28d';
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');
  const bust = url.searchParams.get('t');

  if (!isValidMarket(market)) return NextResponse.json({ error: 'market deve ser US ou BR' }, { status: 400 });
  if (!isValidPeriod(period)) return NextResponse.json({ error: 'period inválido' }, { status: 400 });

  // Modo custom: start e end definidos pelo usuário (aceita start == end = 1 dia)
  const isCustom = !!(startParam && endParam && isValidDate(startParam) && isValidDate(endParam) && startParam <= endParam);
  const key = isCustom ? `${market}:custom:${startParam}:${endParam}` : `${market}:${period}`;
  const hit = CACHE.get(key);
  if (!bust && hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'X-Cache': 'HIT' } });
  }

  try {
    let data;
    if (isCustom) {
      // Custom range: passa start E end customizados para o service
      const startMs = Date.parse(startParam + 'T00:00:00Z');
      const endMs = Date.parse(endParam + 'T00:00:00Z');
      const days = Math.round((endMs - startMs) / 86400000) + 1;
      // Granularidade derivada do número de dias para CUSTOM range.
      // dashboard-service.ts aplica override por days quando hasCustom=true:
      //   <=60d=day, <=180d=week, >180d=month
      let derivedPeriod: PeriodKey = '28d';
      if (days <= 7) derivedPeriod = '7d';
      else if (days <= 14) derivedPeriod = '14d';
      else if (days <= 28) derivedPeriod = '28d';
      else if (days <= 90) derivedPeriod = '3M';
      else if (days <= 180) derivedPeriod = '6M';
      else derivedPeriod = '12M';
      data = await getDashboardPayload(market, derivedPeriod, endParam, startParam);
    } else {
      data = await getDashboardPayload(market, period);
    }
    CACHE.set(key, { ts: Date.now(), data });
    return NextResponse.json(data, { headers: { 'X-Cache': bust ? 'BYPASS' : 'MISS' } });
  } catch (err: any) {
    console.error('[api/data] erro:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}

// Internal helper - NOT exported (Next.js 14 route.ts only allows GET/POST/etc exports).
// Refresh endpoint clears via process.env or no-op since CACHE is per-instance anyway.
function bustCache(market?: Market, period?: PeriodKey) {
  if (market && period) CACHE.delete(`${market}:${period}`);
  else CACHE.clear();
}
// Suppress unused warning - kept for future refactor
void bustCache;

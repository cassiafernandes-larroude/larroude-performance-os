/**
 * /api/unit-economics/{market}/today
 *
 * Endpoint dedicado pra vendas de HOJE (D0).
 * Cache TTL 5min — Cassia: "atualizada".
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTodaySales } from '@/lib/unit-economics/shopify-today';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import type { Market } from '@/lib/unit-economics/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 60;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}

const TTL_5M = 5 * 60 * 1000;

export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const startedAt = Date.now();
  try {
    const cacheKey = `ue-today:${market}:${today}:motherWithProductId:v3`;
    const result = await memo(cacheKey, TTL_5M, async () => {
      const t = await getTodaySales(market);
      // Converte maps em arrays serializáveis
      const products = Array.from(t.byMother.entries()).map(([motherSku, v]) => ({
        motherSku,
        units: v.units,
        orders: v.orders,
        revenue: v.revenue,
      }));
      return {
        market,
        date: today,
        totalUnits: t.totalUnits,
        totalOrders: t.totalOrders,
        totalRevenue: t.totalRevenue,
        partial: t.partial,
        pages: t.pages,
        products,
        generatedAt: t.generatedAt,
      };
    });

    return NextResponse.json(
      { ...result, durationMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: 'Today fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

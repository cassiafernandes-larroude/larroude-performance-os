import { NextRequest, NextResponse } from 'next/server';
import { getTodaySales } from '@/lib/unit-economics/shopify-today';
import { getTodayAdSpendBySku } from '@/lib/unit-economics/today-ad-spend';
import { memo } from '@/lib/ltv-dashboard/memo-cache';
import { todayInMarket } from '@/lib/utils/market-tz';
import type { Market } from '@/lib/unit-economics/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const maxDuration = 60;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }
const TTL_5M = 5 * 60 * 1000;

// Live de HOJE por produto: vendas (Shopify) + spend/purchase por SKU de anúncio (Meta).
// O matching ad-SKU -> mother SKU (prefixo) é feito no cliente, que conhece a seleção,
// pra evitar dupla contagem de ads genéricos ao agregar múltiplos produtos.
export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const today = todayInMarket(market);
  const started = Date.now();
  try {
    const result = await memo(`pp-today:${market}:${today}:v1`, TTL_5M, async () => {
      const [sales, ads] = await Promise.all([getTodaySales(market), getTodayAdSpendBySku(market)]);
      const salesBySku: Record<string, { units: number; orders: number; revenue: number }> = {};
      for (const [motherSku, v] of sales.byMother.entries()) {
        salesBySku[motherSku] = { units: v.units, orders: v.orders, revenue: v.revenue };
      }
      return {
        market,
        date: today,
        metaOk: ads.ok,
        fx: ads.fx,
        totalUnits: sales.totalUnits,
        totalRevenue: sales.totalRevenue,
        partial: sales.partial,
        salesBySku,
        adSpendBySku: ads.spendBySku,
        generatedAt: sales.generatedAt,
      };
    });
    return NextResponse.json(
      { ...result, durationMs: Date.now() - started },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/product-performance/today]', market, msg);
    return NextResponse.json({ error: 'Today fetch failed', detail: msg }, { status: 500 });
  }
}

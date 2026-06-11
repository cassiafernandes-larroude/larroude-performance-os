/**
 * /api/produtos-apostar/{market}
 *
 * Lista produtos candidatos a "apostar" (escalar) baseado em performance 28d.
 *
 * Cassia 2026-06-11: "sugestões devem ser baseadas em performance de venda
 *                     nos últimos 28d"
 *
 * Score = units_28d × margemBrutaPct × (1 - returnRate) × (1 - exchangeRate × 0.3)
 *
 * Junta: catálogo (price, COGS, compareAt) + sales 28d + returns 30d + exchanges 30d.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Market } from '@/lib/unit-economics/shopify';
import { getShopifyCatalog } from '@/lib/unit-economics/shopify-catalog';
import { getSalesLast28d } from '@/lib/unit-economics/shopify-sales28d';
import { getReturnRatesLast30d } from '@/lib/unit-economics/shopify-returns30d';
import { getExchangeRatesLast30d } from '@/lib/unit-economics/shopify-exchanges30d';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 300;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}

export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const currency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';
  const today = new Date();
  today.setUTCDate(today.getUTCDate() - 1);
  const endDate = today.toISOString().slice(0, 10);

  const startedAt = Date.now();
  try {
    const cacheKey = `apostar:${market}:${endDate}:v1`;
    const result = await memo(cacheKey, TTL_6H, async () => {
      const [catalog, sales28, returns30d, exchanges30d] = await Promise.all([
        getShopifyCatalog(market),
        getSalesLast28d(market, endDate),
        getReturnRatesLast30d(market, endDate).catch(() => ({
          byMother: new Map(),
          byVariant: new Map(),
          pixByMother: new Map(),
          pixByVariant: new Map(),
          pixShareOverall: 0,
          pages: 0,
          partial: true,
        })),
        getExchangeRatesLast30d(market, endDate).catch(() => ({
          byMother: new Map(),
          byVariant: new Map(),
          overallRate: 0,
          overallRedoUnits: 0,
          overallTotalUnits: 0,
          pages: 0,
          partial: true,
        })),
      ]);

      // Merge catalogo + sales28d
      type Candidate = {
        motherSku: string;
        productName: string;
        listPrice: number;
        currentPrice: number;
        unitCogs: number;
        units28d: number;
        orders28d: number;
        revenue28d: number;
        avgPricePaid28d: number;
        pixShare28d: number;
        returnRate30d: number;
        exchangeRate30d: number;
        grossMarginPct: number; // (preço médio pago - COGS) / preço médio pago
        score: number;
      };

      const candidates: Candidate[] = [];
      for (const cat of catalog.products) {
        const sale = sales28.byMother.get(cat.motherSku);
        if (!sale || sale.units <= 0) continue; // só sugere quem vendeu
        const ret = returns30d.byMother.get(cat.motherSku);
        const exch = exchanges30d.byMother.get(cat.motherSku);
        const avgPricePaid28d = sale.revenue / sale.units;
        const grossMarginPct =
          avgPricePaid28d > 0 ? (avgPricePaid28d - cat.unitCogs) / avgPricePaid28d : 0;
        const returnRate = ret?.returnRate ?? 0;
        const exchangeRate = exch?.exchangeRate ?? 0;
        const pixShare28d = sale.units > 0 ? sale.pixUnits / sale.units : 0;
        const riskAdjust = (1 - returnRate) * (1 - exchangeRate * 0.3);
        const score = sale.units * Math.max(0, grossMarginPct) * riskAdjust;

        candidates.push({
          motherSku: cat.motherSku,
          productName: cat.productName,
          listPrice: cat.unitListPrice,
          currentPrice: cat.unitPrice,
          unitCogs: cat.unitCogs,
          units28d: sale.units,
          orders28d: sale.orders,
          revenue28d: sale.revenue,
          avgPricePaid28d,
          pixShare28d,
          returnRate30d: returnRate,
          exchangeRate30d: exchangeRate,
          grossMarginPct,
          score,
        });
      }

      candidates.sort((a, b) => b.score - a.score);

      return {
        market,
        currency,
        startDate: sales28.startDate,
        endDate: sales28.endDate,
        totalUnits28d: sales28.totalUnits,
        totalOrders28d: sales28.totalOrders,
        totalRevenue28d: sales28.totalRevenue,
        pixShareOverall28d:
          sales28.totalUnits > 0
            ? candidates.reduce((s, c) => s + c.pixShare28d * c.units28d, 0) / sales28.totalUnits
            : 0,
        partial: sales28.partial || catalog.partial || returns30d.partial || exchanges30d.partial,
        candidates: candidates.slice(0, 50),
      };
    });

    return NextResponse.json(
      { ...result, durationMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=21600' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: 'Apostar fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getUnitEconomicsFromShopify, type Market } from '@/lib/unit-economics/shopify';
import { queryMetaAdsTotal } from '@/lib/main-dashboard/meta-ads';
import { queryGoogleAdsTotalViaSupermetrics } from '@/lib/main-dashboard/supermetrics';
import { getMetaSpendAdjustment } from '@/lib/shared/meta-adjustments';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';
import type { Market as MainMarket } from '@/lib/main-dashboard/types';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
// 300s = Vercel Pro best-effort. Backend já tem timeout interno de 50s.
export const maxDuration = 300;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}

// Janela fixa 60 dias rolling — Unit Economics é per-unit, não tem período de operação.
// 60d = amostra estatisticamente robusta sem timeout Vercel.
const WINDOW_DAYS = 60;

function defaultWindow(): { start: string; end: string } {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const { start, end } = defaultWindow();
  const startedAt = Date.now();
  try {
    const cacheKey = `ue:${market}:${start}:${end}:v2`;
    const result = await memo(cacheKey, TTL_6H, async () => {
      // FONTE ÚNICA: Shopify Admin GraphQL (orders + lineItems + cost + tax + duties + refunds + payments)
      // Marketing vem em paralelo de Meta API + Google Supermetrics
      const [shop, metaTotal, googleTotal] = await Promise.all([
        getUnitEconomicsFromShopify(market, start, end),
        queryMetaAdsTotal(market as MainMarket, start, end).catch((err) => {
          console.error('[ue] Meta API failed:', err);
          return { spend: 0 } as any;
        }),
        queryGoogleAdsTotalViaSupermetrics(market as MainMarket, start, end).catch((err) => {
          console.error('[ue] Google Supermetrics failed:', err);
          return { spend: 0 } as any;
        }),
      ]);

      const metaAdj = getMetaSpendAdjustment(market, start, end);
      const metaSpend = (Number(metaTotal.spend) || 0) + metaAdj;
      const googleSpend = Number(googleTotal.spend) || 0;
      const totalMarketingSpend = metaSpend + googleSpend;
      const marketingPerUnit = shop.totalUnits > 0 ? totalMarketingSpend / shop.totalUnits : 0;

      return {
        ...shop,
        totalMarketingSpend,
        metaSpend,
        googleSpend,
        marketingCoverage: 1.0,
        marketingPerUnit,
      };
    });

    return NextResponse.json(
      { ...result, meta: { generatedAt: new Date().toISOString(), durationMs: Date.now() - startedAt } },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=21600' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/unit-economics]', market, msg);
    return NextResponse.json(
      { error: 'Data fetch failed', detail: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

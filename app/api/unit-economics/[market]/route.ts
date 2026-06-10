import { NextRequest, NextResponse } from 'next/server';
import { getUnitEconomics, type Market } from '@/lib/unit-economics/queries';
import { getCogsBySku } from '@/lib/unit-economics/shopify-cogs';
import { queryMetaAdsTotal } from '@/lib/main-dashboard/meta-ads';
import { queryGoogleAdsTotalViaSupermetrics } from '@/lib/main-dashboard/supermetrics';
import { getMetaSpendAdjustment } from '@/lib/shared/meta-adjustments';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';
import type { Market as MainMarket } from '@/lib/main-dashboard/types';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}
function isoDate(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const url = new URL(req.url);
  const start = isoDate(url.searchParams.get('start'));
  const end = isoDate(url.searchParams.get('end'));
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  if (start > end) return NextResponse.json({ error: 'start must be <= end' }, { status: 400 });

  const startedAt = Date.now();
  try {
    const cacheKey = `ue:${market}:${start}:${end}`;
    const result = await memo(cacheKey, TTL_6H, async () => {
      // 1. BQ Shopify — cascata por unidade (SEM COGS — policy tag PII bloqueia BQ)
      const bq = await getUnitEconomics(market, start, end);

      // 2. Em paralelo: Marketing + COGS via Shopify Admin GraphQL
      const allSkus = bq.variants.map((v) => v.variantSku).filter((s): s is string => !!s);
      const [metaTotal, googleTotal, cogsBySku] = await Promise.all([
        queryMetaAdsTotal(market as MainMarket, start, end).catch((err) => {
          console.error('[ue] Meta API failed:', err);
          return { spend: 0 } as any;
        }),
        queryGoogleAdsTotalViaSupermetrics(market as MainMarket, start, end).catch((err) => {
          console.error('[ue] Google Supermetrics failed:', err);
          return { spend: 0 } as any;
        }),
        getCogsBySku(market, allSkus).catch((err) => {
          console.error('[ue] Shopify COGS failed:', err);
          return new Map<string, number>();
        }),
      ]);

      // 3. Enriquecer cada variant com COGS via Shopify (BQ retorna 0 placeholder)
      for (const v of bq.variants) {
        if (v.variantSku && cogsBySku.has(v.variantSku)) {
          v.unitCogs = cogsBySku.get(v.variantSku)!;
        }
      }
      // Re-calcular unit_cogs do mother SKU = média ponderada das variants
      const variantsByMother = new Map<string, typeof bq.variants>();
      for (const v of bq.variants) {
        const arr = variantsByMother.get(v.motherSku) ?? [];
        arr.push(v);
        variantsByMother.set(v.motherSku, arr);
      }
      for (const p of bq.products) {
        const vs = variantsByMother.get(p.motherSku) ?? [];
        const totalUnitsM = vs.reduce((s, v) => s + v.totalUnits, 0);
        const totalCogsM = vs.reduce((s, v) => s + v.unitCogs * v.totalUnits, 0);
        if (totalUnitsM > 0) p.unitCogs = totalCogsM / totalUnitsM;
      }

      const metaAdj = getMetaSpendAdjustment(market, start, end);
      const metaSpend = (Number(metaTotal.spend) || 0) + metaAdj;
      const googleSpend = Number(googleTotal.spend) || 0;
      const totalMarketingSpend = metaSpend + googleSpend;
      const marketingPerUnit = bq.totalUnits > 0 ? totalMarketingSpend / bq.totalUnits : 0;

      // Cobertura COGS = % de variants com cost preenchido
      const variantsWithCogs = bq.variants.filter((v) => v.unitCogs > 0).length;
      const cogsCoverage = bq.variants.length > 0 ? variantsWithCogs / bq.variants.length : 0;

      return {
        ...bq,
        totalMarketingSpend,
        metaSpend,
        googleSpend,
        marketingCoverage: 1.0,
        marketingPerUnit,
        cogsCoverage,
      };
    });

    return NextResponse.json(
      {
        ...result,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
        },
      }
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

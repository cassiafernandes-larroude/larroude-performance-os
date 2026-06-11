import { NextRequest, NextResponse } from 'next/server';
import { getUnitEconomicsFromShopify, type Market } from '@/lib/unit-economics/shopify';
import { getShopifyCatalog } from '@/lib/unit-economics/shopify-catalog';
import { getReturnRatesLast30d } from '@/lib/unit-economics/shopify-returns30d';
import { getExchangeRatesLast30d } from '@/lib/unit-economics/shopify-exchanges30d';
import { queryMetaAdsTotal } from '@/lib/main-dashboard/meta-ads';
import { queryGoogleAdsTotalViaSupermetrics } from '@/lib/main-dashboard/supermetrics';
import { getMetaSpendAdjustment } from '@/lib/shared/meta-adjustments';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import type { Market as MainMarket } from '@/lib/main-dashboard/types';
import type { ProductUnitEconomics } from '@/lib/unit-economics/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 300;

function isMarket(v: string): v is Market {
  return v === 'US' || v === 'BR';
}

// Regra Cassia (2026-06-10):
// - Janela de sells = D-1 (ontem)
// - Return rate = ultimos 30 dias por produto
// - Catalogo = TODOS produtos (mesmo sem venda)
function defaultWindow(): { start: string; end: string } {
  const today = new Date();
  today.setUTCDate(today.getUTCDate() - 1); // D-1 = ontem
  const d = today.toISOString().slice(0, 10);
  return { start: d, end: d };
}

export async function GET(_req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const { start, end } = defaultWindow();
  const startedAt = Date.now();
  try {
    const cacheKey = `ue:${market}:${start}:${end}:d1-cat-ret30d-exch30d:v5`;
    const result = await memo(cacheKey, TTL_30M, async () => {
      // 6 fontes em paralelo:
      // 1) Shopify orders D-1 (sells)
      // 2) Shopify catalogo TODOS (price + COGS)
      // 3) Shopify refunds 30d (return rate por SKU)
      // 4) Shopify exchanges 30d (REDO rate por SKU)
      // 5) Meta API direto
      // 6) Google Supermetrics
      const [sells, catalog, returns30d, exchanges30d, metaTotal, googleTotal] = await Promise.all([
        getUnitEconomicsFromShopify(market, start, end),
        getShopifyCatalog(market).catch((err) => {
          console.error('[ue] catalog failed:', err);
          return { products: [], variants: [], pages: 0, partial: true };
        }),
        getReturnRatesLast30d(market, end).catch((err) => {
          console.error('[ue] ret30d failed:', err);
          return { byMother: new Map(), byVariant: new Map(), pages: 0, partial: true };
        }),
        getExchangeRatesLast30d(market, end).catch((err) => {
          console.error('[ue] exch30d failed:', err);
          return {
            byMother: new Map(),
            byVariant: new Map(),
            overallRate: 0,
            overallRedoUnits: 0,
            overallTotalUnits: 0,
            pages: 0,
            partial: true,
          };
        }),
        queryMetaAdsTotal(market as MainMarket, start, end).catch((err) => {
          console.error('[ue] Meta failed:', err);
          return { spend: 0 } as any;
        }),
        queryGoogleAdsTotalViaSupermetrics(market as MainMarket, start, end).catch((err) => {
          console.error('[ue] Google failed:', err);
          return { spend: 0 } as any;
        }),
      ]);

      const metaAdj = getMetaSpendAdjustment(market, start, end);
      const metaSpend = (Number(metaTotal.spend) || 0) + metaAdj;
      const googleSpend = Number(googleTotal.spend) || 0;
      const totalMarketingSpend = metaSpend + googleSpend;
      const marketingPerUnit = sells.totalUnits > 0 ? totalMarketingSpend / sells.totalUnits : 0;
      const currency = sells.currency;

      // ========== MERGE: catalogo + sells + returns30d ==========
      // Para cada mother SKU do CATÁLOGO:
      //   - Se vendeu D-1: usa preço/desconto/COGS reais do dia + units
      //   - Se NÃO vendeu D-1: usa preço/COGS do catálogo, units=0
      //   - Return rate: vem dos 30d (independente de ter venda D-1)
      const sellsByMother = new Map(sells.products.map((p) => [p.motherSku, p]));
      const sellsByVariant = new Map(sells.variants.map((v) => [`${v.motherSku}|${v.variantSku}`, v]));

      const mergedProducts: ProductUnitEconomics[] = catalog.products.map((cat) => {
        const sell = sellsByMother.get(cat.motherSku);
        const ret = returns30d.byMother.get(cat.motherSku);
        const exch = exchanges30d.byMother.get(cat.motherSku);
        const returnRate = ret?.returnRate ?? 0;
        const exchangeRate = exch?.exchangeRate ?? 0;
        if (sell) {
          return {
            ...sell,
            productName: sell.productName || cat.productName,
            unitRefund: sell.unitGrossRevenue * returnRate,
            exchangeRate,
          } as ProductUnitEconomics;
        }
        return {
          motherSku: cat.motherSku,
          variantSku: null,
          productName: cat.productName,
          totalUnits: 0,
          totalOrders: 0,
          unitGrossRevenue: cat.unitPrice,
          unitDiscount: 0,
          unitTax: 0,
          unitDuties: 0,
          unitCogs: cat.unitCogs,
          unitRefund: cat.unitPrice * returnRate,
          exchangeRate,
          pixShare: 0,
          currency,
        };
      });

      const mergedVariants: ProductUnitEconomics[] = catalog.variants.map((cat) => {
        const key = `${cat.motherSku}|${cat.variantSku}`;
        const sell = sellsByVariant.get(key);
        const ret = returns30d.byVariant.get(key);
        const exch = exchanges30d.byVariant.get(key);
        const returnRate = ret?.returnRate ?? 0;
        const exchangeRate = exch?.exchangeRate ?? 0;
        if (sell) {
          return {
            ...sell,
            productName: sell.productName || cat.productName,
            unitRefund: sell.unitGrossRevenue * returnRate,
            exchangeRate,
          } as ProductUnitEconomics;
        }
        return {
          motherSku: cat.motherSku,
          variantSku: cat.variantSku,
          productName: cat.productName,
          totalUnits: 0,
          totalOrders: 0,
          unitGrossRevenue: cat.unitPrice,
          unitDiscount: 0,
          unitTax: 0,
          unitDuties: 0,
          unitCogs: cat.unitCogs,
          unitRefund: cat.unitPrice * returnRate,
          exchangeRate,
          pixShare: 0,
          currency,
        };
      });

      // Ordena: produtos com venda no D-1 primeiro (por units desc), depois resto alfabético
      mergedProducts.sort((a, b) => {
        if (b.totalUnits !== a.totalUnits) return b.totalUnits - a.totalUnits;
        return a.productName.localeCompare(b.productName);
      });

      // Total return rate agregado (30d, ponderado)
      let totalQty30d = 0;
      let totalRefunded30d = 0;
      for (const v of returns30d.byMother.values()) {
        totalQty30d += v.totalQty;
        totalRefunded30d += v.refundedQty;
      }
      const overallReturnRate30d = totalQty30d > 0 ? totalRefunded30d / totalQty30d : 0;

      return {
        market: sells.market,
        startDate: start,
        endDate: end,
        currency,
        totalUnits: sells.totalUnits,
        totalOrders: sells.totalOrders,
        totalRevenue: sells.totalRevenue,
        totalRefunds: sells.totalRefunds,
        cogsCoverage: sells.cogsCoverage,
        partial: sells.partial || catalog.partial || returns30d.partial || exchanges30d.partial,
        pagesProcessed: sells.pagesProcessed + catalog.pages + returns30d.pages + exchanges30d.pages,
        catalogProductsCount: catalog.products.length,
        catalogVariantsCount: catalog.variants.length,
        returnRate30d: overallReturnRate30d,
        returnTotalQty30d: totalQty30d,
        returnRefundedQty30d: totalRefunded30d,
        exchangeRate30d: exchanges30d.overallRate,
        exchangeTotalQty30d: exchanges30d.overallTotalUnits,
        exchangeRedoQty30d: exchanges30d.overallRedoUnits,
        totalMarketingSpend,
        metaSpend,
        googleSpend,
        marketingCoverage: 1.0,
        marketingPerUnit,
        products: mergedProducts,
        variants: mergedVariants,
      };
    });

    return NextResponse.json(
      { ...result, meta: { generatedAt: new Date().toISOString(), durationMs: Date.now() - startedAt } },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=1800' } }
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

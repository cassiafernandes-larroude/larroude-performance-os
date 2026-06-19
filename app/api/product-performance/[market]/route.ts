import { NextRequest, NextResponse } from 'next/server';
import { getProductPerformance, type Market } from '@/lib/unit-economics/queries';
import { getProductImages } from '@/lib/unit-economics/product-images';
import { runQuery } from '@/lib/bigquery/client';
import { memo, TTL_30M } from '@/lib/ltv-dashboard/memo-cache';
import { dateRangeForPeriod, dateRangeCompleted, previousRangeOf } from '@/lib/utils/periods';
import type { Period } from '@/types/metric';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

const VALID: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];
const TTL_6H = 6 * 60 * 60 * 1000;
const FX_FALLBACK = 5.45; // BRL por USD

interface PerfRow {
  motherSku: string;
  name: string;
  image: string | null;
  category: string;
  units: number;
  revenue: number;
  prevUnits: number;
  prevRevenue: number;
}

function resolveRange(sp: URLSearchParams): { start: string; end: string } {
  const cs = sp.get('start');
  const ce = sp.get('end');
  if (cs && ce && /^\d{4}-\d{2}-\d{2}$/.test(cs) && /^\d{4}-\d{2}-\d{2}$/.test(ce)) return { start: cs, end: ce };
  const periodParam = sp.get('period') as Period | null;
  const period: Period = periodParam && VALID.includes(periodParam) ? periodParam : '28d';
  const r = (period === '3M' || period === '6M' || period === '12M') ? dateRangeForPeriod(period) : dateRangeCompleted(period);
  return { start: r.from, end: r.to };
}

async function fxBrlPerUsd(yyyymm: string): Promise<number> {
  try {
    const rows = await runQuery<{ avg_rate_brl_usd: number }>(
      `SELECT avg_rate_brl_usd FROM \`larroude-data-prod.gold.fx_rates_monthly\` WHERE month = @m LIMIT 1`,
      { m: yyyymm }
    );
    const rate = Number(rows?.[0]?.avg_rate_brl_usd);
    if (rate > 0 && rate < 20) return rate;
  } catch { /* fallback */ }
  return FX_FALLBACK;
}

// Ranking de UMA praça, com imagem + período anterior. Memoizado por praça+janela.
async function rankingForMarket(market: Market, start: string, end: string): Promise<PerfRow[]> {
  return memo(`pp-rank:${market}:${start}:${end}:v2`, TTL_30M, async () => {
    const { from: pStart, to: pEnd } = previousRangeOf(start, end);
    const [cur, prev, imgs] = await Promise.all([
      getProductPerformance(market, start, end),
      getProductPerformance(market, pStart, pEnd),
      memo(`pp-img:${market}:v1`, TTL_6H, () => getProductImages(market)),
    ]);
    const prevMap = new Map(prev.map((r) => [r.motherSku, r]));
    return cur.map((r) => {
      const p = prevMap.get(r.motherSku);
      return {
        motherSku: r.motherSku,
        name: imgs[r.motherSku]?.name || r.name,
        image: imgs[r.motherSku]?.image ?? null,
        category: r.category,
        units: r.units,
        revenue: r.revenue,
        prevUnits: p?.units ?? 0,
        prevRevenue: p?.revenue ?? 0,
      };
    });
  });
}

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const m = ctx.params.market.toUpperCase();
  if (m !== 'US' && m !== 'BR' && m !== 'ALL') return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  const { start, end } = resolveRange(req.nextUrl.searchParams);

  try {
    let products: PerfRow[];
    let currency: 'USD' | 'BRL';
    let fx: number | null = null;

    if (m === 'ALL') {
      currency = 'USD';
      fx = await fxBrlPerUsd(start.slice(0, 7)); // BRL por USD
      const [us, br] = await Promise.all([rankingForMarket('US', start, end), rankingForMarket('BR', start, end)]);
      const merged = new Map<string, PerfRow>();
      const add = (rows: PerfRow[], toUsd: number) => {
        for (const r of rows) {
          const e = merged.get(r.motherSku) || { motherSku: r.motherSku, name: r.name, image: r.image, category: r.category, units: 0, revenue: 0, prevUnits: 0, prevRevenue: 0 };
          e.units += r.units;
          e.revenue += r.revenue * toUsd;
          e.prevUnits += r.prevUnits;
          e.prevRevenue += r.prevRevenue * toUsd;
          if (!e.image && r.image) e.image = r.image;
          merged.set(r.motherSku, e);
        }
      };
      add(us, 1);          // US já em USD
      add(br, 1 / fx);     // BR (BRL) → USD
      products = Array.from(merged.values());
    } else {
      currency = m === 'US' ? 'USD' : 'BRL';
      products = await rankingForMarket(m, start, end);
    }

    products.sort((a, b) => b.revenue - a.revenue);
    const totalUnits = products.reduce((s, r) => s + r.units, 0);
    const totalRevenue = products.reduce((s, r) => s + r.revenue, 0);

    return NextResponse.json(
      { market: m, start, end, currency, fx, totalUnits, totalRevenue, productCount: products.length, products },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/product-performance]', m, msg);
    return NextResponse.json({ error: 'Data fetch failed', detail: msg }, { status: 500 });
  }
}

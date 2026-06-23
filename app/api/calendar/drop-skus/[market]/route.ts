import { NextRequest, NextResponse } from 'next/server';
import { getDropProducts, getCollectionProducts, salesPerCanonicalSku, type DropProduct } from '@/lib/calendar/results';
import { asanaConfigured } from '@/lib/calendar/asana';
import { canonicalSku } from '@/lib/calendar/ad-spend';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const TTL_10M = 10 * 60 * 1000;

function isMarket(v: string): v is 'US' | 'BR' { return v === 'US' || v === 'BR'; }

// Lista os SKUs/produtos de uma ação: por tag de produto (drop), Collection ID, ou SKUs manuais.
export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  if (!asanaConfigured()) return NextResponse.json({ available: false, reason: 'asana_token', products: [] });

  const sp = new URL(req.url).searchParams;
  const tag = sp.get('tag');
  const collection = sp.get('collection');
  const skusRaw = sp.get('skus');
  const since = sp.get('since');
  const until = sp.get('until');
  const dateOk = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

  try {
    let products: DropProduct[] = [];
    let key = '';
    if (collection && /^\d+$/.test(collection)) {
      key = `skus:${market}:col:${collection}`;
      products = await memo(key, TTL_10M, () => getCollectionProducts(market, collection));
    } else if (skusRaw) {
      // SKUs manuais: lista direto (canônicos), sem ida ao Shopify.
      const skus = skusRaw.split(',').map((s) => canonicalSku(s.trim())).filter(Boolean);
      products = [...new Set(skus)].map((s) => ({ title: s, sku: s }));
    } else if (tag && /^[A-Za-z0-9._-]+$/.test(tag)) {
      key = `skus:${market}:tag:${tag}`;
      products = await memo(key, TTL_10M, () => getDropProducts(market, tag));
    } else {
      return NextResponse.json({ error: 'informe tag, collection ou skus' }, { status: 400 });
    }

    // Unidades + faturamento por SKU na janela (mesma do resultado da ação).
    if (dateOk(since) && dateOk(until) && products.length) {
      const sales = await memo(`skusales:${market}:${since}:${until}:${key || skusRaw}`, TTL_10M,
        () => salesPerCanonicalSku(market, since!, until!, products.map((p) => p.sku)));
      products = products.map((p) => ({ ...p, units: sales.get(p.sku)?.units ?? 0, revenue: sales.get(p.sku)?.revenue ?? 0 }));
      products.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
    }
    return NextResponse.json({ available: true, market, products });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ available: false, reason: 'error', error: msg, products: [] });
  }
}

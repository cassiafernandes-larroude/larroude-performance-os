// Cassia 2026-06-21: Creatives × Collections — anúncios de COLEÇÃO (ID da coleção no nome do ad)
// agrupados por coleção, com nome resolvido no Shopify. Espelha skus-performance, mas a chave é
// o Collection ID (extractAdRefFromName type='collection') em vez do mother SKU.
//
// GET ?region=US|BR&since=YYYY-MM-DD&until=YYYY-MM-DD
// Response: { collections: CollectionRow[] } ordenado por spend.

import { NextRequest, NextResponse } from 'next/server';
import { resolveAccountsForRegion, fetchInsights, fetchAdsMetadataByIds, findAction, findActionValue, ACTION_TYPES } from '@/lib/meta-ads-native/meta-ads';
import { extractAdRefFromName } from '@/lib/meta-ads-native/sku-extractor';
import { shopifyGraphQL, hasShopifyCredentials } from '@/lib/shopify/admin';
import type { Region } from '@/lib/meta-ads-native/types';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

interface AdDetail {
  id: string; name: string; account: string; campaignName: string | null; adsetName: string | null;
  thumbnail: string | null; spend: number; purchases: number; status: string | null; effectiveStatus: string | null; isActive: boolean;
}
interface CollectionRow {
  id: string; name: string | null; image: string | null; productCount: number;
  spend: number; purchases: number; revenue: number; roas: number;
  activeAdsCount: number; totalAdsCount: number; ads: AdDetail[];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const region = (sp.get('region') || 'US') as Region;
  const since = sp.get('since'); const until = sp.get('until');
  if (!since || !until) return NextResponse.json({ error: 'since/until required' }, { status: 400 });

  try {
    const resolved = await resolveAccountsForRegion(region);
    const accounts = resolved.all;
    // Ad-level insights de todas as contas da praça (todos os ads, não só top spend).
    const adFields = ['ad_id', 'ad_name', 'campaign_name', 'adset_name', 'spend', 'actions', 'action_values'];
    const perAccount = await Promise.all(accounts.map((a) =>
      fetchInsights(a.id, { level: 'ad', timeRange: { since, until }, fields: adFields, limit: 500 })
        .then((rows) => rows.map((r) => ({ ...r, _account: a.name })))
        .catch(() => [] as any[])
    ));
    const adsRaw = perAccount.flat();

    // Só ads cujo nome traz um Collection ID.
    const collAds = adsRaw
      .map((r) => ({ r, ref: extractAdRefFromName(r.ad_name) }))
      .filter((x) => x.ref?.type === 'collection');

    // Metadata (status + thumbnail) real-time.
    const adIds = collAds.map((x) => String(x.r.ad_id)).filter(Boolean);
    const metaList = adIds.length ? await fetchAdsMetadataByIds(adIds).catch(() => []) : [];
    const metaMap = new Map<string, any>();
    for (const m of metaList) metaMap.set(String(m.id), m);

    // Agrupa por Collection ID.
    const groups = new Map<string, CollectionRow>();
    for (const { r, ref } of collAds) {
      const id = ref!.value;
      const meta = metaMap.get(String(r.ad_id));
      const spend = Number(r.spend) || 0;
      const purchases = findAction(r.actions, ACTION_TYPES.purchase);
      const revenue = findActionValue(r.action_values, ACTION_TYPES.purchase);
      const eff = (meta?.effectiveStatus || meta?.status || '').toUpperCase();
      const isActive = eff === 'ACTIVE';
      const g = groups.get(id) || { id, name: null, image: null, productCount: 0, spend: 0, purchases: 0, revenue: 0, roas: 0, activeAdsCount: 0, totalAdsCount: 0, ads: [] };
      g.spend += spend; g.purchases += purchases; g.revenue += revenue; g.totalAdsCount += 1; if (isActive) g.activeAdsCount += 1;
      g.ads.push({
        id: String(r.ad_id), name: String(r.ad_name || ''), account: r._account,
        campaignName: r.campaign_name ?? null, adsetName: r.adset_name ?? null,
        thumbnail: meta?.thumbnail ?? null, spend, purchases,
        status: meta?.status ?? null, effectiveStatus: meta?.effectiveStatus ?? null, isActive,
      });
      groups.set(id, g);
    }

    // Resolve nomes das coleções no Shopify (nodes em lote).
    const ids = Array.from(groups.keys());
    if (ids.length && hasShopifyCredentials(region)) {
      try {
        const gids = ids.map((id) => `gid://shopify/Collection/${id}`);
        const data = await shopifyGraphQL<{ nodes: Array<{ id: string; title: string; productsCount?: { count: number }; image?: { url: string } | null } | null> }>(
          region,
          `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Collection { id title productsCount{count} image{url} } } }`,
          { ids: gids }
        );
        for (const n of data?.nodes || []) {
          if (!n?.id) continue;
          const numId = n.id.split('/').pop()!;
          const g = groups.get(numId);
          if (g) { g.name = n.title; g.productCount = n.productsCount?.count ?? 0; g.image = n.image?.url ?? null; }
        }
      } catch (e) { console.warn('[collections-performance] name resolve falhou', (e as Error)?.message); }
    }

    const collections = Array.from(groups.values())
      .map((g) => ({ ...g, roas: g.spend > 0 ? g.revenue / g.spend : 0, ads: g.ads.sort((a, b) => b.spend - a.spend) }))
      .sort((a, b) => b.spend - a.spend);

    return NextResponse.json({ collections }, { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' } });
  } catch (e: any) {
    console.error('[collections-performance]', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

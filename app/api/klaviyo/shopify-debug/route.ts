import { NextRequest, NextResponse } from 'next/server';
import { shopifyGraphQL, isShopifyConfigured } from '@/lib/klaviyo/shopify';
import type { Market } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Q = `
query Debug($q: String!) {
  orders(first: 100, query: $q, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id
        createdAt
        name
        sourceName
        sourceIdentifier
        app { name }
        totalPriceSet { shopMoney { amount } }
        customerJourneySummary {
          lastVisit {
            source
            sourceType
            referrerUrl
            landingPage
            utmParameters { source medium campaign }
          }
        }
      }
    }
  }
}`;

function classifySignal(node: any): string[] {
  const hits: string[] = [];
  const lv = node.customerJourneySummary?.lastVisit;
  const lower = (s: any) => String(s || '').toLowerCase();
  // 1. utm_source contém klaviyo
  if (lower(lv?.utmParameters?.source).includes('klaviyo')) hits.push('utm_source=klaviyo');
  // 2. last visit source contém klaviyo
  if (lower(lv?.source).includes('klaviyo')) hits.push('lastVisit.source=klaviyo');
  // 3. landing/referrer URL contém klaviyo
  if (lower(lv?.landingPage).includes('klaviyo')) hits.push('lastVisit.landingPage~klaviyo');
  if (lower(lv?.referrerUrl).includes('klaviyo')) hits.push('lastVisit.referrerUrl~klaviyo');

  // 4. sourceType=EMAIL
  if (lv?.sourceType === 'EMAIL') hits.push('sourceType=EMAIL');
  // 5. utm_medium=email
  if (lower(lv?.utmParameters?.medium) === 'email') hits.push('utm_medium=email');
  // 6. sourceName (order-level)
  if (lower(node.sourceName).includes('klaviyo')) hits.push('order.sourceName=klaviyo');
  // 7. app name
  if (lower(node.app?.name).includes('klaviyo')) hits.push('app.name=klaviyo');
  return hits;
}

export async function GET(req: NextRequest) {
  const market = (req.nextUrl.searchParams.get('market') || 'US').toUpperCase() as Market;
  if (!isShopifyConfigured(market)) {
    return NextResponse.json({ error: `Shopify not configured for ${market}` }, { status: 500 });
  }
  const start = req.nextUrl.searchParams.get('start') || '2026-05-15';
  const end = req.nextUrl.searchParams.get('end') || '2026-06-03';
  try {
    const data: any = await shopifyGraphQL(market, Q, { q: `created_at:>=${start} created_at:<=${end}` });
    const edges = data?.orders?.edges || [];
    const signalCounts: Record<string, number> = {};
    const sourceNames: Record<string, number> = {};
    const referrerUrls: Record<string, number> = {};
    const landingPages: Record<string, number> = {};
    const appNames: Record<string, number> = {};
    const samples: any[] = [];
    let totalRev = 0;
    for (const e of edges) {
      const n = e.node;
      const amt = Number(n.totalPriceSet?.shopMoney?.amount || 0);
      totalRev += amt;
      sourceNames[n.sourceName || '(null)'] = (sourceNames[n.sourceName || '(null)'] || 0) + 1;
      const lv = n.customerJourneySummary?.lastVisit;
      const refUrl = lv?.referrerUrl;
      if (refUrl) {
        try { const u = new URL(refUrl); referrerUrls[u.hostname] = (referrerUrls[u.hostname] || 0) + 1; } catch { referrerUrls[String(refUrl).slice(0, 40)] = (referrerUrls[String(refUrl).slice(0, 40)] || 0) + 1; }
      } else {
        referrerUrls['(null)'] = (referrerUrls['(null)'] || 0) + 1;
      }
      const lp = lv?.landingPage;
      if (lp) {
        try { const u = new URL(lp); landingPages[u.hostname + u.pathname.slice(0,30)] = (landingPages[u.hostname + u.pathname.slice(0,30)] || 0) + 1; } catch {}
      }
      const app = n.app?.name || '(null)';
      appNames[app] = (appNames[app] || 0) + 1;
      const hits = classifySignal(n);
      for (const h of hits) signalCounts[h] = (signalCounts[h] || 0) + 1;
      if (hits.length > 0 && samples.length < 5) {
        samples.push({ id: n.id, createdAt: n.createdAt, rev: amt, hits, sourceName: n.sourceName, lastVisit: lv });
      }
    }
    return NextResponse.json({
      market, ordersCount: edges.length, totalRevenue: Math.round(totalRev),
      signalCounts, sourceNames, referrerUrls, appNames, landingPages,
      samples
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

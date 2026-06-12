/**
 * Shopify Last-Click attribution via customerJourneySummary.
 * Replicado de larroude-crm-dashboard (REPLICATION-GUIDE Section 6).
 *
 * Match logic:
 *   - lastVisit.source contém 'klaviyo' (case-insensitive)
 *   - OU lastVisit.utmParameters.source contém 'klaviyo'
 *   - OU lastVisit.sourceType === 'EMAIL'
 *   - OU lastVisit.utmParameters.medium === 'email'
 *
 * BR pode retornar 0 matches se Klaviyo BR não estiver adicionando UTM.
 */

import type { Market, DateRange } from './types';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

function getConfig(market: Market) {
  if (market === 'US') {
    return {
      domain: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com',
      token: process.env.SHOPIFY_US_ADMIN_API_TOKEN || '',
    };
  }
  return {
    domain: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com',
    token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '',
  };
}

const QUERY = `
  query Orders($cursor: String, $query: String!) {
    orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
          customerJourneySummary {
            lastVisit {
              source
              sourceType
              utmParameters { source medium campaign }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function isKlaviyoLastClick(o: any): boolean {
  const last = o?.customerJourneySummary?.lastVisit;
  if (!last) return false;
  const utm = last.utmParameters;
  return (
    [last.source, utm?.source]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
      .some((s) => s.includes('klaviyo'))
    || last.sourceType === 'EMAIL'
    || (utm?.medium && String(utm.medium).toLowerCase() === 'email')
  );
}

export async function shopifyLastClickKlaviyo(market: Market, range: DateRange): Promise<{
  ordersCount: number;
  revenue: number;
  totalOrdersInPeriod: number;
  totalRevenueInPeriod: number;
  matchedShare: number;
  byCampaign: { campaign: string; orders: number; revenue: number }[];
}> {
  const { domain, token } = getConfig(market);
  if (!token) {
    return { ordersCount: 0, revenue: 0, totalOrdersInPeriod: 0, totalRevenueInPeriod: 0, matchedShare: 0, byCampaign: [] };
  }

  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const queryStr = `created_at:>=${range.start} created_at:<=${range.end}`;
  let cursor: string | null = null;
  let hasNext = true;
  let safety = 0;
  const maxPages = 60;

  let ordersCount = 0;
  let revenue = 0;
  let totalOrdersInPeriod = 0;
  let totalRevenueInPeriod = 0;
  const byCampaignMap = new Map<string, { orders: number; revenue: number }>();

  while (hasNext && safety++ < maxPages) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: QUERY, variables: { cursor, query: queryStr } }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[shopify-attr ${market}] HTTP ${res.status}`);
      break;
    }
    const json: any = await res.json();
    const orders = json?.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      const rev = parseFloat(o.totalPriceSet?.shopMoney?.amount || '0') || 0;
      totalOrdersInPeriod++;
      totalRevenueInPeriod += rev;
      if (isKlaviyoLastClick(o)) {
        ordersCount++;
        revenue += rev;
        const camp = o?.customerJourneySummary?.lastVisit?.utmParameters?.campaign || 'unknown';
        const ex = byCampaignMap.get(camp) || { orders: 0, revenue: 0 };
        ex.orders++;
        ex.revenue += rev;
        byCampaignMap.set(camp, ex);
      }
    }
    hasNext = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  return {
    ordersCount,
    revenue,
    totalOrdersInPeriod,
    totalRevenueInPeriod,
    matchedShare: totalRevenueInPeriod > 0 ? revenue / totalRevenueInPeriod : 0,
    byCampaign: Array.from(byCampaignMap.entries())
      .map(([campaign, v]) => ({ campaign, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20),
  };
}

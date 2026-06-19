import { NextResponse } from 'next/server';
import { shopifyGraphQL } from '@/lib/shopify/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Cassia 2026-06-17: PROBE temporario — descobrir o schema de Shop Campaigns / marketing
// spend na Shopify Admin API (US). Remover depois de mapear os campos de spend.
export async function GET() {
  const fields = await shopifyGraphQL<any>('US', `{ __type(name: "MarketingActivity") { fields { name type { name kind ofType { name kind } } } } }`);
  const engagementType = await shopifyGraphQL<any>('US', `{ __type(name: "MarketingEngagement") { fields { name } } }`);
  const sample = await shopifyGraphQL<any>('US', `{
    marketingActivities(first: 15, sortKey: CREATED_AT, reverse: true) {
      edges { node { id title status } }
    }
  }`);
  return NextResponse.json({
    marketingActivityFields: (fields?.__type?.fields || []).map((f: any) => f.name),
    marketingActivityFieldsDetail: fields?.__type?.fields || null,
    marketingEngagementFields: (engagementType?.__type?.fields || []).map((f: any) => f.name),
    sampleActivities: (sample?.marketingActivities?.edges || []).map((e: any) => e.node),
  });
}

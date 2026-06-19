import { NextResponse } from 'next/server';
import { shopifyGraphQLRaw } from '@/lib/shopify/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Cassia 2026-06-17: PROBE temporario — Shop Campaigns / marketing spend (Shopify Admin US).
// Captura erros crus pra distinguir "0 atividades" de "erro de escopo".
export async function GET() {
  // Escopos atuais do token (prova de qual permissao falta)
  const scopes = await shopifyGraphQLRaw('US', `{ currentAppInstallation { accessScopes { handle } } }`);
  const scopeHandles = (scopes?.data?.currentAppInstallation?.accessScopes || []).map((s: any) => s.handle);
  // 1) marketingActivities cru (com errors)
  const acts = await shopifyGraphQLRaw('US', `{
    marketingActivities(first: 25) {
      edges { node { id title status marketingChannelType app { title } adSpend { amount currencyCode } } }
    }
  }`);
  // 2) tenta engagements via channel (Shop usa channelHandle)
  const eng = await shopifyGraphQLRaw('US', `{
    marketingActivities(first: 5) { edges { node { id title } } }
  }`);
  return NextResponse.json({
    tokenScopes: scopeHandles,
    hasMarketingScope: scopeHandles.includes('read_marketing_events'),
    activitiesHttpStatus: acts?.httpStatus,
    activitiesErrors: acts?.errors ?? null,
    activitiesCount: acts?.data?.marketingActivities?.edges?.length ?? null,
    activitiesSample: (acts?.data?.marketingActivities?.edges || []).slice(0, 8).map((e: any) => e.node),
    secondHttpStatus: eng?.httpStatus,
    secondErrors: eng?.errors ?? null,
  });
}

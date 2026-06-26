// Cassia 2026-06-26: diagnóstico da conexão Google Ads API (não expõe valores de segredo).
// Chama getGoogleAdsSpendByDay para HOJE e devolve fonte ('api' = ao vivo ok / 'bigquery_fallback'
// = creds incompletas) + erro (se a API lançou) + quais env vars existem (booleans).
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAdsSpendByDay } from '@/lib/cac-dashboard/connectors/google-ads';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = ((sp.get('market') || 'US').toUpperCase() === 'BR' ? 'BR' : 'US') as 'US' | 'BR';
  const tz = market === 'US' ? 'America/New_York' : 'America/Sao_Paulo';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

  const env = {
    GADS_DEVELOPER_TOKEN: !!process.env.GADS_DEVELOPER_TOKEN,
    GADS_CLIENT_ID: !!process.env.GADS_CLIENT_ID,
    GADS_CLIENT_SECRET: !!process.env.GADS_CLIENT_SECRET,
    GADS_REFRESH_TOKEN: !!process.env.GADS_REFRESH_TOKEN,
    GADS_CUSTOMER_ID_US: !!process.env.GADS_CUSTOMER_ID_US,
    GADS_CUSTOMER_ID_BR: !!process.env.GADS_CUSTOMER_ID_BR,
    GADS_CUSTOMER_ID: !!process.env.GADS_CUSTOMER_ID,
    GADS_LOGIN_CUSTOMER_ID: !!process.env.GADS_LOGIN_CUSTOMER_ID,
  };

  try {
    const { data, source } = await getGoogleAdsSpendByDay(market, today, today);
    let total = 0;
    for (const v of data.values()) total += v;
    return NextResponse.json({ market, today, source, days: data.size, total, env });
  } catch (e) {
    return NextResponse.json({ market, today, error: (e as Error)?.message?.slice(0, 400) || 'unknown', env });
  }
}

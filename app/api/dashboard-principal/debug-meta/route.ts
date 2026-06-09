// GET /api/dashboard-principal/debug-meta?market=US
// Debug: chama a Meta Graph API direto com o token do env e retorna
// per-account daily spend + purchases. Usado pra diagnosticar onde os
// dados estao zerados (pipeline BQ vs Meta API).

import { NextResponse } from 'next/server';
import type { Market } from '@/lib/main-dashboard/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const META_GRAPH_API = 'https://graph.facebook.com/v20.0';

const META_ACCOUNT_IDS: Record<Market, string[]> = {
  US: ['2047856822417350', '929449929417505'],
  BR: ['1735567560524487', '1975682443187483', '756931007040325'],
};

function getToken(): string | null {
  return (
    process.env.META_ACCESS_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN ||
    process.env.FB_ADS_ACCESS_TOKEN ||
    process.env.META_GRAPH_ACCESS_TOKEN ||
    null
  );
}

function extractAction(actions: any[] | undefined, type: string): number {
  if (!Array.isArray(actions)) return 0;
  const item = actions.find((a) => a?.action_type === type);
  return item ? Number(item.value || 0) : 0;
}

async function fetchAccountDaily(accountId: string, start: string, end: string) {
  const token = getToken();
  if (!token) return { accountId, error: 'no_token', rows: [] };
  const params = new URLSearchParams({
    fields: 'spend,actions,date_start',
    time_range: JSON.stringify({ since: start, until: end }),
    time_increment: '1',
    level: 'account',
    limit: '500',
    access_token: token,
  });
  const url = `${META_GRAPH_API}/act_${accountId}/insights?${params.toString()}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) {
      return { accountId, error: `HTTP_${res.status}`, body: text.slice(0, 500), rows: [] };
    }
    const json = JSON.parse(text);
    if (json.error) {
      return { accountId, error: 'api_error', detail: json.error, rows: [] };
    }
    const rows = (json.data || []).map((r: any) => ({
      date: String(r.date_start || '').slice(0, 10),
      spend: Number(r.spend || 0),
      purchases: extractAction(r.actions, 'offsite_conversion.fb_pixel_purchase'),
    }));
    return { accountId, error: null, rows };
  } catch (err: any) {
    return { accountId, error: err?.message || 'fetch_failed', rows: [] };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = (url.searchParams.get('market') ?? 'US') as Market;
  const start = url.searchParams.get('start') ?? '2026-05-12';
  const end = url.searchParams.get('end') ?? '2026-06-08';

  const token = getToken();
  const tokenStatus = {
    hasToken: !!token,
    tokenPreview: token ? `${token.slice(0, 10)}...${token.slice(-6)}` : null,
    envVarUsed: process.env.META_ACCESS_TOKEN ? 'META_ACCESS_TOKEN'
      : process.env.FACEBOOK_ACCESS_TOKEN ? 'FACEBOOK_ACCESS_TOKEN'
      : process.env.FB_ADS_ACCESS_TOKEN ? 'FB_ADS_ACCESS_TOKEN'
      : process.env.META_GRAPH_ACCESS_TOKEN ? 'META_GRAPH_ACCESS_TOKEN'
      : null,
  };

  const accountIds = META_ACCOUNT_IDS[market];
  const results = await Promise.all(accountIds.map((id) => fetchAccountDaily(id, start, end)));

  // Build per-date aggregate (sum across all accounts in this market)
  const byDate = new Map<string, { spend: number; purchases: number }>();
  for (const r of results) {
    for (const row of r.rows) {
      const cur = byDate.get(row.date) ?? { spend: 0, purchases: 0 };
      cur.spend += row.spend;
      cur.purchases += row.purchases;
      byDate.set(row.date, cur);
    }
  }
  const aggregate = Array.from(byDate.entries())
    .map(([date, v]) => ({ date, spend: v.spend, purchases: v.purchases }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    market,
    period: { start, end },
    tokenStatus,
    perAccount: results,
    aggregate,
  });
}

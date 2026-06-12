/**
 * Cron: pre-warming de caches.
 * Roda 1x/dia (limite Vercel Hobby) e bate em todos endpoints + 2 markets.
 *
 * Authenticated via CRON_SECRET header se configurado.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENDPOINTS = [
  'overview',
  'campaigns',
  'flows',
  'segments',
  'list-health',
  'timing',
  'insights',
  'shopify-attribution',
];

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const host = url.origin;
  const results: Record<string, any> = {};

  for (const market of ['US', 'BR']) {
    for (const endpoint of ENDPOINTS) {
      const key = `${endpoint}:${market}`;
      try {
        const startedAt = Date.now();
        const r = await fetch(`${host}/api/klaviyo/${endpoint}/${market}?period=28d`, { cache: 'no-store' });
        results[key] = { status: r.status, ms: Date.now() - startedAt };
      } catch (err) {
        results[key] = { error: (err as Error).message };
      }
    }
  }

  return NextResponse.json({ ok: true, warmedAt: new Date().toISOString(), results });
}

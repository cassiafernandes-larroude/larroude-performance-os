import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TAGS = ['overview','campaigns','flows','list-health','revenue','timing','insights','segments','benchmarks'];

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-vercel-cron-secret') || req.nextUrl.searchParams.get('s') || '';
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    // Allow Vercel internal cron header
    if (!req.headers.get('user-agent')?.includes('vercel-cron')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  for (const m of ['US','BR'] as const) {
    for (const t of TAGS) revalidateTag(`crm:${m}:${t}`);
  }
  return NextResponse.json({ ok: true, revalidatedAt: new Date().toISOString() });
}

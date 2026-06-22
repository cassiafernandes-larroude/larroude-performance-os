import { NextRequest, NextResponse } from 'next/server';
import { getSubtasks, asanaConfigured } from '@/lib/calendar/asana';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const TTL_10M = 10 * 60 * 1000;

export async function GET(_req: NextRequest, ctx: { params: { gid: string } }) {
  const gid = ctx.params.gid;
  if (!/^\d+$/.test(gid)) return NextResponse.json({ error: 'gid inválido' }, { status: 400 });
  if (!asanaConfigured()) return NextResponse.json({ available: false, reason: 'asana_token', subtasks: [] });
  try {
    const subtasks = await memo(`calsub:${gid}`, TTL_10M, () => getSubtasks(gid));
    return NextResponse.json({ available: true, gid, subtasks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ available: false, reason: 'error', error: msg, gid, subtasks: [] });
  }
}

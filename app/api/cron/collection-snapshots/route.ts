// Cassia 2026-06-29: cron diário que congela a composição das collections usadas no Calendário.
// Lê as ações do Asana, junta as collections referenciadas (Collection ID) e grava no BQ os SKUs
// canônicos de hoje de cada uma. O results.ts mede campanhas por collection contra esse snapshot
// (composição da janela), não contra o membership ao vivo — que muda quando a collection é editada.
import { NextResponse } from 'next/server';
import { getMacroCalendar, asanaConfigured, type Market } from '@/lib/calendar/asana';
import { collectionSkus, toCanonical } from '@/lib/calendar/results';
import { ensureSnapshotTable, writeSnapshot } from '@/lib/calendar/collection-snapshots';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!asanaConfigured()) {
    return NextResponse.json({ skipped: 'asana_token' });
  }

  try {
    const actions = await getMacroCalendar();
    // (market, collectionId) distintos. Ação BOTH → tenta US e BR (collection ID é por loja).
    const targets = new Map<string, { market: Market; collectionId: string }>();
    for (const a of actions) {
      if (!a.collectionId) continue;
      const markets: Market[] = a.market === 'BOTH' ? ['US', 'BR'] : [a.market];
      for (const m of markets) targets.set(`${m}:${a.collectionId}`, { market: m, collectionId: a.collectionId });
    }

    if (targets.size) await ensureSnapshotTable();

    const snapshotted: { market: Market; collectionId: string; skus: number }[] = [];
    const errors: { market: Market; collectionId: string; error: string }[] = [];
    for (const { market, collectionId } of targets.values()) {
      try {
        const skus = toCanonical(await collectionSkus(market, collectionId));
        if (skus.length) {
          await writeSnapshot(market, collectionId, skus);
          snapshotted.push({ market, collectionId, skus: skus.length });
        }
      } catch (e) {
        errors.push({ market, collectionId, error: e instanceof Error ? e.message.slice(0, 160) : 'erro' });
      }
    }

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      collections: targets.size,
      snapshotted,
      errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[cron/collection-snapshots]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

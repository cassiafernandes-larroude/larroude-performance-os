import { NextRequest, NextResponse } from 'next/server';
import { getMacroCalendar, asanaConfigured, type Market, type CalendarAction } from '@/lib/calendar/asana';
import { getActionResult, actionWindow, type ActionResult } from '@/lib/calendar/results';
import { memo } from '@/lib/ltv-dashboard/memo-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const TTL_10M = 10 * 60 * 1000;

function isMarket(v: string): v is Market { return v === 'US' || v === 'BR'; }

export async function GET(req: NextRequest, ctx: { params: { market: string } }) {
  const market = ctx.params.market.toUpperCase();
  if (!isMarket(market)) return NextResponse.json({ error: 'Invalid market' }, { status: 400 });

  if (!asanaConfigured()) {
    return NextResponse.json({ available: false, reason: 'asana_token', market, weeks: [] });
  }

  const today = new Date().toISOString().slice(0, 10);
  // ?n=… (botão Atualizar) fura o cache de 10min, forçando releitura do Asana + Shopify.
  const nonce = new URL(req.url).searchParams.get('n') || '';

  try {
    const result = await memo(`calendar:v1:${market}:${today}:${nonce}`, TTL_10M, async () => {
      const all = await getMacroCalendar();
      // Mercado: a aba US mostra US + Ambos; BR mostra BR + Ambos.
      const mine = all.filter((a) => a.market === market || a.market === 'BOTH');

      // Resultado só para ações COM vínculo e cuja janela já começou (mensurável).
      const enriched = await Promise.all(mine.map(async (a) => {
        const win = actionWindow(a.startOn, a.dueOn);
        const hasLink = a.sitewide || a.collectionId != null || a.skus.length > 0 || a.dropTag != null;
        let result: ActionResult | null = null;
        let resultError: string | null = null;
        let status: 'no_link' | 'pending' | 'measured' = hasLink ? 'pending' : 'no_link';
        if (hasLink && win && win.start <= today) {
          try {
            result = await getActionResult(market, win.start, win.end, { skus: a.skus, collectionId: a.collectionId, dropTag: a.dropTag, sitewide: a.sitewide });
            status = 'measured';
          } catch (e: any) {
            resultError = e?.message ? String(e.message).slice(0, 160) : 'erro';
          }
        }
        return { ...a, window: win, hasLink, result, resultError, status };
      }));

      // Agrupa por semana, preservando a ordem de aparição (= ordem das seções no Asana).
      const weekOrder: string[] = [];
      const byWeek = new Map<string, typeof enriched>();
      for (const a of enriched) {
        if (!byWeek.has(a.week)) { byWeek.set(a.week, []); weekOrder.push(a.week); }
        byWeek.get(a.week)!.push(a);
      }
      const weeks = weekOrder.map((w) => ({
        week: w,
        actions: byWeek.get(w)!.sort((x, y) => (x.dueOn || x.startOn || '').localeCompare(y.dueOn || y.startOn || '')),
      }));

      const totals = {
        actions: enriched.length,
        linked: enriched.filter((a) => a.hasLink).length,
        measured: enriched.filter((a) => a.status === 'measured').length,
      };
      return { available: true, market, today, weeks, totals };
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[api/calendar]', market, msg);
    return NextResponse.json({ available: false, reason: 'error', error: msg, market, weeks: [] });
  }
}

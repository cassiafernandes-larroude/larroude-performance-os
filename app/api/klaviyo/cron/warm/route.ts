// Pre-warming cron: aquece os caches do Klaviyo CRM (unstable_cache 12h + stale-while-revalidate).
// Cassia 2026-06-29: 2 correções —
//   (1) BUG: as URLs eram `${base}/api/overview` (404). O certo é `${base}/api/klaviyo/overview`.
//       O cron NUNCA aqueceu nada. Corrigido.
//   (2) Ranges longos (3M/6M/12M) agora também são aquecidos. Os relatórios do Klaviyo demoram
//       ~30-45s p/ 1 ano (a API devolve 429 até o relatório ficar pronto → backoff), então não cabe
//       aguardar TODAS as combinações no budget de 60s. Aquecemos com prioridade (overview primeiro)
//       e um deadline; uma vez que o cache é populado, o stale-while-revalidate serve instantâneo.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Res = { label: string; status: number; ms: number; error?: string };

async function hit(base: string, path: string, label: string): Promise<Res> {
  const start = Date.now();
  try {
    const r = await fetch(`${base}${path}`, { cache: 'no-store' });
    return { label, status: r.status, ms: Date.now() - start };
  } catch (e) {
    return { label, status: 0, ms: Date.now() - start, error: (e as Error).message };
  }
}

/** Roda os jobs em paralelo (pool) até a lista acabar OU o deadline passar. */
async function runPool(jobs: (() => Promise<Res>)[], pool: number, deadline: number, out: Res[]) {
  let idx = 0;
  const worker = async () => {
    while (idx < jobs.length && Date.now() < deadline) {
      const job = jobs[idx++];
      out.push(await job());
    }
  };
  await Promise.all(Array.from({ length: pool }, worker));
}

export async function GET(req: NextRequest) {
  const base = `${req.nextUrl.origin}/api/klaviyo`;
  const markets = ['US', 'BR'];
  const results: Res[] = [];
  const t0 = Date.now();

  // FASE 1: ranges curtos (rápidos) — aquece com deadline ~26s.
  const shortPeriods = ['L7D', 'L28D'];
  const shortEndpoints = ['overview', 'campaigns', 'flows', 'segments', 'benchmarks', 'list-health', 'timing', 'insights', 'shopify-attribution'];
  const shortJobs: (() => Promise<Res>)[] = [];
  for (const market of markets)
    for (const period of shortPeriods)
      for (const e of shortEndpoints)
        shortJobs.push(() => hit(base, `/${e}?market=${market}&period=${period}`, `${e} ${market} ${period}`));
  await runPool(shortJobs, 6, t0 + 26_000, results);

  // FASE 2: ranges longos — overview primeiro (aba padrão), depois o resto. Deadline ~56s total.
  const longPeriods = ['3M', '6M', '12M'];
  const longEndpoints = ['overview', 'campaigns', 'segments', 'benchmarks', 'timing', 'insights'];
  const longJobs: (() => Promise<Res>)[] = [];
  for (const e of longEndpoints)
    for (const period of longPeriods)
      for (const market of markets)
        longJobs.push(() => hit(base, `/${e}?market=${market}&period=${period}`, `${e} ${market} ${period}`));
  await runPool(longJobs, 4, t0 + 56_000, results);

  const ok = results.filter(r => r.status === 200).length;
  return NextResponse.json({ generatedAt: new Date().toISOString(), elapsedMs: Date.now() - t0, ok, total: results.length, results });
}

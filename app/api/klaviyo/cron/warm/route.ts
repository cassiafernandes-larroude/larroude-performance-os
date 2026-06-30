// Pre-warming cron: aquece os caches do Klaviyo CRM (unstable_cache 12h + stale-while-revalidate).
// Cassia 2026-06-29:
//   (1) BUG corrigido: as URLs eram `${base}/api/overview` (404) — o certo é `/api/klaviyo/overview`.
//       O cron NUNCA aqueceu nada. Agora aponta certo.
//   (2) Aquece também ranges longos (3M/6M/12M). Os relatórios do Klaviyo p/ 1 ano levam ~30-45s
//       (a API devolve 429 até o relatório ficar pronto → backoff), então NÃO cabe aquecer todas as
//       combinações em 60s. Usamos um CAP RÍGIDO de tempo: cada request é abortado no deadline, então
//       o cron nunca estoura (FUNCTION_INVOCATION_TIMEOUT). Aquece o que couber (curtos + ~os primeiros
//       longos, overview primeiro); o resto é coberto por stale-while-revalidate / tráfego orgânico.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Res = { label: string; status: number; ms: number; error?: string };

// Aborta no deadline (limite rígido) — garante que o cron termine antes dos 60s da função.
async function hit(base: string, path: string, label: string, deadline: number): Promise<Res> {
  const start = Date.now();
  const remaining = deadline - start;
  if (remaining <= 500) return { label, status: -2, ms: 0, error: 'skip(no-budget)' };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), remaining);
  try {
    const r = await fetch(`${base}${path}`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(to);
    return { label, status: r.status, ms: Date.now() - start };
  } catch (e) {
    clearTimeout(to);
    return { label, status: 0, ms: Date.now() - start, error: (e as Error).name };
  }
}

async function runPool(jobs: (() => Promise<Res>)[], pool: number, out: Res[]) {
  let idx = 0;
  const worker = async () => { while (idx < jobs.length) out.push(await jobs[idx++]()); };
  await Promise.all(Array.from({ length: pool }, worker));
}

export async function GET(req: NextRequest) {
  const base = `${req.nextUrl.origin}/api/klaviyo`;
  const markets = ['US', 'BR'];
  const results: Res[] = [];
  const t0 = Date.now();

  // FASE 1: ranges curtos (rápidos). Cap 30s. Ordem prioriza overview/campaigns/flows.
  const shortDeadline = t0 + 30_000;
  const shortEndpoints = ['overview', 'campaigns', 'flows', 'segments', 'benchmarks', 'shopify-attribution', 'list-health', 'timing', 'insights'];
  const shortJobs: (() => Promise<Res>)[] = [];
  for (const period of ['L7D', 'L28D'])
    for (const e of shortEndpoints)
      for (const market of markets)
        shortJobs.push(() => hit(base, `/${e}?market=${market}&period=${period}`, `${e} ${market} ${period}`, shortDeadline));
  await runPool(shortJobs, 6, results);

  // FASE 2: ranges longos. Cap rígido 114s (maxDuration 120). overview primeiro (aba padrão).
  const longDeadline = t0 + 114_000;
  const longEndpoints = ['overview', 'campaigns', 'segments', 'benchmarks', 'timing', 'insights'];
  const longJobs: (() => Promise<Res>)[] = [];
  for (const e of longEndpoints)
    for (const period of ['3M', '6M', '12M'])
      for (const market of markets)
        longJobs.push(() => hit(base, `/${e}?market=${market}&period=${period}`, `${e} ${market} ${period}`, longDeadline));
  await runPool(longJobs, 4, results);

  const ok = results.filter(r => r.status === 200).length;
  return NextResponse.json({ generatedAt: new Date().toISOString(), elapsedMs: Date.now() - t0, ok, total: results.length, results });
}

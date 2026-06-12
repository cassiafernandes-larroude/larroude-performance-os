// Pre-warming cron: aquece TODOS os caches importantes (12h revalidate)
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function hit(url: string, label: string) {
  const start = Date.now();
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return { label, status: r.status, ms: Date.now() - start };
  } catch (e) {
    return { label, status: 0, ms: Date.now() - start, error: (e as Error).message };
  }
}

export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const results: any[] = [];
  const periods = ['L7D', 'L28D'];
  const markets = ['US', 'BR'];
  const lightEndpoints = ['overview', 'segments', 'benchmarks', 'list-health', 'timing', 'insights'];

  for (const market of markets) {
    for (const period of periods) {
      results.push(await hit(`${base}/api/flows?market=${market}&period=${period}`, `flows ${market} ${period}`));
      const batch = lightEndpoints.map(e => hit(`${base}/api/${e}?market=${market}&period=${period}`, `${e} ${market} ${period}`));
      results.push(...await Promise.all(batch));
      results.push(await hit(`${base}/api/campaigns?market=${market}&period=${period}`, `campaigns ${market} ${period}`));
      results.push(await hit(`${base}/api/shopify-attribution?market=${market}&period=${period}`, `shopify-attribution ${market} ${period}`));

      try {
        const flowsJson = await fetch(`${base}/api/flows?market=${market}&period=${period}`).then(r => r.json());
        const categories = ['WELCOME_TRUST','HYGIENE_WINBACK','FAMILY_CROSSSELL','POST_PURCHASE','TRIGGERS','LIFECYCLE_OTHER'];
        for (const cat of categories) {
          const ids = (flowsJson.rows || []).filter((r: any) => r.category === cat && !r.isCS).map((r: any) => r.id).slice(0, 20).join(',');
          if (!ids) continue;
          results.push(await hit(`${base}/api/flow-series-bulk?market=${market}&period=${period}&flowIds=${ids}`, `bulk ${market} ${period} ${cat}`));
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch {}
    }
  }

  const ok = results.filter(r => r.status === 200).length;
  return NextResponse.json({ generatedAt: new Date().toISOString(), ok, total: results.length, results });
}

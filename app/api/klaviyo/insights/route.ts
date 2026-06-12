import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange } from '@/lib/klaviyo/period';
import { listCampaigns, campaignReports, listLiveFlows, flowReports } from '@/lib/klaviyo/queries';
import { reportToMap, buildCampaignRows, buildFlowRows } from '@/lib/klaviyo/transform';
import { CAMPAIGN_BENCHMARKS, FLOW_BENCHMARKS, signalFor } from '@/lib/klaviyo/classify';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const [camps, cR, flows, fR] = await Promise.all([
    listCampaigns(market, range), campaignReports(market, range),
    listLiveFlows(market), flowReports(market, range)
  ]);
  const cRows = buildCampaignRows(camps, reportToMap(cR)).filter(r => r.recipients > 0);
  const fRows = buildFlowRows(flows, reportToMap(fR)).filter(r => !r.isCS && r.recipients > 0);

  const green: string[] = [];
  const red: string[] = [];
  const next: string[] = [];

  // Sinais campanhas
  for (const c of cRows) {
    const bm = CAMPAIGN_BENCHMARKS[c.type];
    const sig = signalFor(c.openRate, c.clickRate, c.rpr, bm);
    if (sig === 'SCALE') green.push(`📈 SCALE ${c.name} (${c.type}) — RPR $${c.rpr.toFixed(2)} acima do target.`);
    if (sig === 'STOP') red.push(`🛑 STOP ${c.name} (${c.type}) — 2+ métricas abaixo do baseline.`);
  }

  // Sinais flows
  for (const f of fRows) {
    const bm = FLOW_BENCHMARKS[f.flowType];
    const sig = signalFor(f.openRate, f.clickRate, f.rpr, bm);
    if (sig === 'SCALE') green.push(`✅ FLOW SCALE ${f.name} — performance acima do target.`);
    if (sig === 'STOP') red.push(`🔴 FLOW ${f.name} (${f.flowType}) — abaixo do baseline em 2+ métricas.`);
  }

  // Próximos passos derivados
  const acQty = fRows.filter(f => f.flowType === 'ABANDONED_CHECKOUT').length;
  if (acQty === 0) next.push('Ativar Abandoned Checkout — é o flow de maior RPR.');
  const pdQty = fRows.filter(f => f.flowType === 'PRICE_DROP').length;
  if (pdQty < 3) next.push('Expandir Price Drop / Back in Stock — apenas ' + pdQty + ' flow(s) ativos. 2º maior ROI.');
  const vipCount = cRows.filter(c => c.type === 'VIP').length;
  if (vipCount === 0) next.push('Criar campanha VIP mensal — segmento de maior RPR absoluto.');

  // Deliverability
  const bouncesIssues = cRows.filter(c => c.bounceRate > 0.5).length;
  const unsubsIssues = cRows.filter(c => c.unsubRate > 0.5).length;

  // Revenue opportunities
  const totalCampRev = cRows.reduce((s,r) => s+r.revenue, 0);
  const totalFlowRev = fRows.reduce((s,r) => s+r.revenue, 0);

  return {
    generatedAt: new Date().toISOString(), market, period, range,
    greenFlags: green.slice(0, 8),
    redFlags: red.slice(0, 8),
    nextSteps: next.slice(0, 6),
    deliverability: { bouncesIssues, unsubsIssues, totalCamps: cRows.length, totalFlows: fRows.length },
    revenueOpps: {
      campaigns: totalCampRev,
      flows: totalFlowRev,
      flowsShare: (totalCampRev + totalFlowRev) ? totalFlowRev / (totalCampRev + totalFlowRev) * 100 : 0
    }
  };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['insights', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'insights')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

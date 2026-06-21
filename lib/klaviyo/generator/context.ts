// Cassia 2026-06-20: monta o contexto de performance histórica que alimenta o gerador de campanhas.
// Classificação pela CONVENÇÃO DE NOME real do Klaviyo (FP/MD/PO/CS). Reaproveita queries/transforms existentes.
import { klaviyoFetch } from '../klaviyo';
import { listCampaigns, campaignReports, listSegments, listLists } from '../queries';
import { reportToMap, buildCampaignRows } from '../transform';
import { periodToRange } from '../period';
import { classifyCampaign, CAMPAIGN_TYPE_LABELS } from '../classify';
import type { Market, Period, CampaignRow } from '@/types/klaviyo/models';
import type {
  PerformanceContext,
  HistoricalCampaign,
  AudienceOption,
  BestDay,
  BenchmarkByType,
  CampaignType,
  BaseTemplate,
} from '@/types/klaviyo/generator';

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Busca o assunto real de uma campanha via /campaigns/{id}/campaign-messages.
async function fetchSubject(market: Market, campaignId: string): Promise<{ subject?: string; previewText?: string }> {
  try {
    const resp: any = await klaviyoFetch({ market, path: `/campaigns/${campaignId}/campaign-messages` });
    const msg = resp?.data?.[0]?.attributes;
    const content = msg?.definition?.content || msg?.content || {};
    return { subject: content.subject || undefined, previewText: content.preview_text || undefined };
  } catch {
    return {};
  }
}

// Pega o HTML do template do último e-mail enviado (campaign → message → template).
async function fetchTemplateHtml(market: Market, campaignId: string): Promise<string | null> {
  try {
    const msgs: any = await klaviyoFetch({ market, path: `/campaigns/${campaignId}/campaign-messages` });
    const messageId = msgs?.data?.[0]?.id;
    if (!messageId) return null;
    const tpl: any = await klaviyoFetch({ market, path: `/campaign-messages/${messageId}/template` });
    const html = tpl?.data?.attributes?.html;
    return typeof html === 'string' && html.length > 0 ? html : null;
  } catch {
    return null;
  }
}

function toHistorical(c: CampaignRow, subj?: { subject?: string; previewText?: string }): HistoricalCampaign {
  return {
    name: c.name,
    type: classifyCampaign(c.name),
    subject: subj?.subject,
    previewText: subj?.previewText,
    openRate: round(c.openRate),
    clickRate: round(c.clickRate),
    rpr: round(c.rpr, 3),
    revenue: Math.round(c.revenue),
    recipients: c.recipients,
    sendDate: c.sendDate?.slice(0, 10) || '',
  };
}

function aggregateBestDays(rows: CampaignRow[]): BestDay[] {
  const acc: Record<number, { or: number[]; rpr: number[] }> = {};
  for (let i = 0; i < 7; i++) acc[i] = { or: [], rpr: [] };
  for (const r of rows) {
    if (!r.sendDate) continue;
    const d = new Date(r.sendDate).getUTCDay();
    acc[d].or.push(r.openRate);
    acc[d].rpr.push(r.rpr);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0);
  return DAY_NAMES.map((dayName, i) => ({
    dayName,
    avgOpenRate: round(avg(acc[i].or)),
    avgRpr: round(avg(acc[i].rpr), 3),
    campaigns: acc[i].or.length,
  }))
    .filter((d) => d.campaigns > 0)
    .sort((a, b) => b.avgRpr - a.avgRpr);
}

// Benchmarks por tipo da convenção (FP/MD/PO/CS/OTHER).
function aggregateBenchmarks(rows: CampaignRow[]): BenchmarkByType[] {
  const acc: Record<string, { or: number[]; ctr: number[]; rpr: number[] }> = {};
  for (const r of rows) {
    const t = classifyCampaign(r.name);
    if (!acc[t]) acc[t] = { or: [], ctr: [], rpr: [] };
    acc[t].or.push(r.openRate);
    acc[t].ctr.push(r.clickRate);
    acc[t].rpr.push(r.rpr);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0);
  return Object.entries(acc)
    .map(([type, a]) => ({
      type: `${type} (${CAMPAIGN_TYPE_LABELS[type as keyof typeof CAMPAIGN_TYPE_LABELS] || type})`,
      avgOpenRate: round(avg(a.or)),
      avgClickRate: round(avg(a.ctr)),
      avgRpr: round(avg(a.rpr), 3),
      campaigns: a.or.length,
    }))
    .sort((a, b) => b.campaigns - a.campaigns);
}

function aggregateAudiences(
  camps: any[],
  reportMap: Map<string, Record<string, number>>,
  audMap: Map<string, { name: string; kind: 'segment' | 'list' }>
): Map<string, AudienceOption & { _or: number; _ctr: number; revenue: number }> {
  const agg = new Map<string, AudienceOption & { _or: number; _ctr: number; revenue: number }>();
  for (const c of camps) {
    const included: string[] = c.attributes?.audiences?.included || [];
    const stats = reportMap.get(c.id) || {};
    const recipients = Number(stats.recipients) || 0;
    if (recipients === 0) continue;
    const revenue = Number(stats.conversion_value) || 0;
    const opens = Number(stats.opens_unique) || 0;
    const clicks = Number(stats.clicks_unique) || 0;
    const delivered = Number(stats.delivered) || recipients;
    for (const audId of included) {
      const info = audMap.get(audId);
      if (!info) continue;
      const cur =
        agg.get(audId) ||
        ({ id: audId, name: info.name, kind: info.kind, recipients: 0, revenue: 0, _or: 0, _ctr: 0, rpr: 0 } as any);
      cur.recipients = (cur.recipients || 0) + recipients;
      cur.revenue += revenue;
      cur._or += (opens / Math.max(1, delivered)) * 100 * recipients;
      cur._ctr += (clicks / Math.max(1, delivered)) * 100 * recipients;
      agg.set(audId, cur);
    }
  }
  for (const v of agg.values()) {
    const r = v.recipients || 1;
    v.openRate = v._or / r;
    v.clickRate = v._ctr / r;
    v.rpr = v.revenue / r;
  }
  return agg;
}

export async function buildPerformanceContext(
  market: Market,
  focusType: CampaignType,
  period: Period = '6M'
): Promise<PerformanceContext> {
  const range = periodToRange(period);
  const [meta, report, segs, lists] = await Promise.all([
    listCampaigns(market, range),
    campaignReports(market, range),
    listSegments(market),
    listLists(market),
  ]);

  const reportMap = reportToMap(report);
  const rows = buildCampaignRows(meta as any[], reportMap)
    .filter((r) => r.recipients > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Mapa de audiências.
  const audMap = new Map<string, { name: string; kind: 'segment' | 'list' }>();
  for (const s of segs as any[]) audMap.set(s.id, { name: s.attributes?.name || '(sem nome)', kind: 'segment' });
  for (const l of lists as any[])
    if (!audMap.has(l.id)) audMap.set(l.id, { name: l.attributes?.name || '(lista sem nome)', kind: 'list' });

  // Audiências impactadas nos últimos 3 dias (para exclusão / anti-overlap / fadiga).
  const RECENT_DAYS = 3;
  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  const recentIds = new Set<string>();
  let recentReach = 0;
  for (const c of meta as any[]) {
    const a = c.attributes || {};
    const t = a.send_time || a.scheduled_at;
    if (!t || new Date(t).getTime() < cutoff) continue;
    for (const id of a.audiences?.included || []) recentIds.add(id);
    recentReach += Number((reportMap.get(c.id) || {}).recipients) || 0;
  }
  const recentlyMailed = {
    days: RECENT_DAYS,
    totalReach: recentReach,
    audiences: [...recentIds].map((id) => {
      const info = audMap.get(id);
      return { id, name: info?.name || id, kind: info?.kind || ('segment' as const) };
    }),
  };

  // Campanhas do tipo escolhido (prioridade) + top geral. Cassia 2026-06-21: reduzido (4+6) p/ velocidade.
  const typeRows = rows.filter((r) => classifyCampaign(r.name) === focusType);
  const ofType = typeRows.slice(0, 4);
  const topOverall = rows.slice(0, 6);

  // Base a duplicar = último e-mail ENVIADO do tipo (mais recente por data de envio).
  const baseCampaign = [...typeRows]
    .filter((r) => r.sendDate)
    .sort((a, b) => new Date(b.sendDate).getTime() - new Date(a.sendDate).getTime())[0];

  // Cassia 2026-06-21: HTML da base + assuntos reais em PARALELO (antes era serial).
  const subjectTargets = Array.from(new Map([...ofType, ...topOverall].map((c) => [c.id, c])).values());
  const subjMap = new Map<string, { subject?: string; previewText?: string }>();
  const [baseHtml] = await Promise.all([
    baseCampaign ? fetchTemplateHtml(market, baseCampaign.id) : Promise.resolve(null),
    ...subjectTargets.map(async (c) => subjMap.set(c.id, await fetchSubject(market, c.id))),
  ]);
  const baseTemplate: BaseTemplate | null =
    baseCampaign && baseHtml
      ? { campaignId: baseCampaign.id, campaignName: baseCampaign.name, sendDate: baseCampaign.sendDate?.slice(0, 10) || '', html: baseHtml }
      : null;

  const accAvg = (key: 'openRate' | 'clickRate') =>
    rows.length ? round(rows.reduce((x, r) => x + r[key], 0) / rows.length) : 0;

  // Audiências: performance-ranked + completa com segments ativos.
  const audAgg = aggregateAudiences(meta as any[], reportMap, audMap);
  const ranked = Array.from(audAgg.values()).sort((a, b) => (b.rpr || 0) - (a.rpr || 0));
  const audiences: AudienceOption[] = [];
  const seen = new Set<string>();
  for (const a of ranked.slice(0, 25)) {
    audiences.push({
      id: a.id,
      name: a.name,
      kind: a.kind,
      recipients: a.recipients,
      openRate: round(a.openRate || 0),
      clickRate: round(a.clickRate || 0),
      rpr: round(a.rpr || 0, 3),
    });
    seen.add(a.id);
  }
  for (const s of segs as any[]) {
    if (audiences.length >= 40) break;
    if (seen.has(s.id)) continue;
    audiences.push({ id: s.id, name: s.attributes?.name || '(sem nome)', kind: 'segment' });
    seen.add(s.id);
  }

  return {
    market,
    period,
    currency: market === 'BR' ? 'BRL' : 'USD',
    focusType,
    focusTypeLabel: CAMPAIGN_TYPE_LABELS[focusType],
    baseTemplate,
    focusTypeCampaigns: ofType.map((c) => toHistorical(c, subjMap.get(c.id))),
    topCampaigns: topOverall.map((c) => toHistorical(c, subjMap.get(c.id))),
    audiences,
    recentlyMailed,
    bestDays: aggregateBestDays(rows),
    benchmarks: aggregateBenchmarks(rows),
    accountAvgOpenRate: accAvg('openRate'),
    accountAvgClickRate: accAvg('clickRate'),
  };
}

function round(n: number, decimals = 1): number {
  const f = Math.pow(10, decimals);
  return Math.round((n || 0) * f) / f;
}

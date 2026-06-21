/**
 * Dashboard de Google Ads — Cassia 2026-06-21.
 * Fonte: BigQuery gold.all_channels_daily (channel='google_ads'), por campanha/dia.
 * Tem spend, conversions, conversion_value, clicks, impressions (US em USD, BR em BRL).
 * Sem dependência de Supermetrics (quota mensal estoura). Tipo de campanha derivado do nome.
 */

import { runQuery } from '@/lib/bigquery/client';
import { previousRangeOf, daysBetween, granularityForDays, type Granularity } from '@/lib/utils/periods';

export type Market = 'US' | 'BR';

export interface Kpi { label: string; value: number; delta?: number; format: 'currency' | 'integer' | 'percent' | 'decimal'; }
export interface DayPoint { date: string; value: number; }
export interface GCampaignRow {
  name: string; type: string; spend: number; clicks: number; impressions: number;
  conversions: number; value: number; roas: number; cpa: number; ctr: number; cpc: number;
  lastDate: string; active: boolean;
}
export interface GoogleAdsBundle {
  market: Market; currency: 'USD' | 'BRL'; start: string; end: string; generatedAt: string;
  kpis: { spend: Kpi; value: Kpi; roas: Kpi; conversions: Kpi; convRate: Kpi; cpa: Kpi; cpc: Kpi; clicks: Kpi; impressions: Kpi; ctr: Kpi; cpm: Kpi };
  series: { spend: DayPoint[]; value: DayPoint[]; roas: DayPoint[]; conversions: DayPoint[]; clicks: DayPoint[]; ctr: DayPoint[]; cpc: DayPoint[] };
  campaigns: GCampaignRow[];
  byType: GCampaignRow[];
}

interface Raw { date: string; campaign_name: string; spend: number; clicks: number; impressions: number; conversions: number; value: number; }

// Tipo de campanha Google a partir do nome (PMax/Shopping/Search/Demand Gen/Outros).
export function campaignType(name: string): string {
  const n = (name || '').toLowerCase();
  if (/pmax|performance.?max/.test(n)) return 'Performance Max';
  if (/shopping/.test(n)) return 'Shopping';
  if (/search|branded/.test(n)) return 'Search';
  if (/demand.?gen|dgen|\byt\b|youtube|video|gd-/.test(n)) return 'Demand Gen / Vídeo';
  return 'Outros';
}

async function fetchRows(market: Market, start: string, end: string): Promise<Raw[]> {
  const sql = `
    SELECT FORMAT_DATE('%Y-%m-%d', date) AS date, IFNULL(campaign_name, '(sem nome)') AS campaign_name,
      CAST(spend AS FLOAT64) AS spend, clicks, impressions,
      CAST(conversions AS FLOAT64) AS conversions, CAST(conversion_value AS FLOAT64) AS value
    FROM \`larroude-data-prod.gold.all_channels_daily\`
    WHERE channel = 'google_ads' AND market = @mkt AND date BETWEEN @start AND @end
  `;
  return runQuery<Raw>(sql, { mkt: market.toLowerCase(), start, end });
}

function bucketDate(iso: string, g: Granularity): string {
  if (g === 'day') return iso;
  const d = new Date(iso + 'T00:00:00Z');
  if (g === 'week') { const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
  return iso.slice(0, 7) + '-01'; // month
}

const sum = (a: Raw[], k: keyof Raw) => a.reduce((s, r) => s + (Number(r[k]) || 0), 0);
function roasOf(v: number, s: number) { return s > 0 ? v / s : 0; }
function pct(cur: number, prev: number): number | undefined { return prev > 0 ? ((cur - prev) / prev) * 100 : undefined; }

export async function getGoogleAdsBundle(market: Market, start: string, end: string): Promise<GoogleAdsBundle> {
  const prev = previousRangeOf(start, end);
  const [rows, prevRows] = await Promise.all([fetchRows(market, start, end), fetchRows(market, prev.from, prev.to)]);
  const currency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';

  const tot = (a: Raw[]) => {
    const spend = sum(a, 'spend'), value = sum(a, 'value'), clicks = sum(a, 'clicks'),
      impressions = sum(a, 'impressions'), conversions = sum(a, 'conversions');
    return {
      spend, value, clicks, impressions, conversions, roas: roasOf(value, spend),
      cpc: clicks > 0 ? spend / clicks : 0, cpa: conversions > 0 ? spend / conversions : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      convRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
    };
  };
  const c = tot(rows), p = tot(prevRows);

  const kpis = {
    spend: { label: 'INVESTIMENTO', value: c.spend, delta: pct(c.spend, p.spend), format: 'currency' as const },
    value: { label: 'VALOR DE CONVERSÃO', value: c.value, delta: pct(c.value, p.value), format: 'currency' as const },
    roas: { label: 'ROAS', value: c.roas, delta: pct(c.roas, p.roas), format: 'decimal' as const },
    conversions: { label: 'CONVERSÕES', value: c.conversions, delta: pct(c.conversions, p.conversions), format: 'integer' as const },
    convRate: { label: 'TAXA DE CONVERSÃO', value: c.convRate, delta: pct(c.convRate, p.convRate), format: 'percent' as const },
    cpa: { label: 'CPA', value: c.cpa, delta: pct(c.cpa, p.cpa), format: 'currency' as const },
    cpc: { label: 'CPC', value: c.cpc, delta: pct(c.cpc, p.cpc), format: 'currency' as const },
    clicks: { label: 'CLIQUES', value: c.clicks, delta: pct(c.clicks, p.clicks), format: 'integer' as const },
    impressions: { label: 'IMPRESSÕES', value: c.impressions, delta: pct(c.impressions, p.impressions), format: 'integer' as const },
    ctr: { label: 'CTR', value: c.ctr, delta: pct(c.ctr, p.ctr), format: 'percent' as const },
    cpm: { label: 'CPM', value: c.cpm, delta: pct(c.cpm, p.cpm), format: 'currency' as const },
  };

  // Séries diárias (bucketizadas por granularidade da janela).
  const g = granularityForDays(daysBetween(start, end));
  const buckets = new Map<string, { spend: number; value: number; clicks: number; impressions: number; conversions: number }>();
  for (const r of rows) {
    const k = bucketDate(r.date, g);
    const b = buckets.get(k) || { spend: 0, value: 0, clicks: 0, impressions: 0, conversions: 0 };
    b.spend += Number(r.spend) || 0; b.value += Number(r.value) || 0; b.clicks += Number(r.clicks) || 0;
    b.impressions += Number(r.impressions) || 0; b.conversions += Number(r.conversions) || 0;
    buckets.set(k, b);
  }
  // Cassia 2026-06-21: enumera TODOS os buckets da janela (US tem meses sem dados — fev→mai);
  // dias/semanas/meses vazios entram como 0 pra a timeline não "pular".
  const ZERO = { spend: 0, value: 0, clicks: 0, impressions: 0, conversions: 0 };
  const stepBucket = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z');
    if (g === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (g === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  };
  const dates: string[] = [];
  for (let cur = bucketDate(start, g), last = bucketDate(end, g); cur <= last; cur = stepBucket(cur)) dates.push(cur);
  const bg = (d: string) => buckets.get(d) || ZERO;
  const series = {
    spend: dates.map((d) => ({ date: d, value: Math.round(bg(d).spend) })),
    value: dates.map((d) => ({ date: d, value: Math.round(bg(d).value) })),
    roas: dates.map((d) => ({ date: d, value: Math.round(roasOf(bg(d).value, bg(d).spend) * 100) / 100 })),
    conversions: dates.map((d) => ({ date: d, value: Math.round(bg(d).conversions) })),
    clicks: dates.map((d) => ({ date: d, value: bg(d).clicks })),
    ctr: dates.map((d) => ({ date: d, value: bg(d).impressions > 0 ? Math.round((bg(d).clicks / bg(d).impressions) * 1000) / 10 : 0 })),
    cpc: dates.map((d) => ({ date: d, value: bg(d).clicks > 0 ? Math.round((bg(d).spend / bg(d).clicks) * 100) / 100 : 0 })),
  };

  // "Ativa" = investiu nos últimos 3 dias do dado disponível (gold não tem status de campanha).
  const maxDataDate = rows.reduce((mx, r) => (r.date > mx ? r.date : mx), '');
  const activeCutoff = maxDataDate ? new Date(new Date(maxDataDate + 'T00:00:00Z').getTime() - 3 * 86400000).toISOString().slice(0, 10) : '';

  // Agregação por campanha e por tipo.
  const aggBy = (keyFn: (r: Raw) => string, typeFn: (k: string) => string): GCampaignRow[] => {
    const m = new Map<string, Raw[]>();
    for (const r of rows) { const k = keyFn(r); const arr = m.get(k) || []; arr.push(r); m.set(k, arr); }
    return Array.from(m.entries()).map(([name, a]) => {
      const t = tot(a);
      const lastDate = a.reduce((mx, r) => ((Number(r.spend) || 0) > 0 && r.date > mx ? r.date : mx), '');
      return { name, type: typeFn(name), spend: t.spend, clicks: t.clicks, impressions: t.impressions, conversions: t.conversions, value: t.value, roas: t.roas, cpa: t.cpa, ctr: t.ctr, cpc: t.cpc, lastDate, active: !!lastDate && lastDate >= activeCutoff };
    }).sort((x, y) => y.spend - x.spend);
  };
  const campaigns = aggBy((r) => r.campaign_name, campaignType);
  const byType = aggBy((r) => campaignType(r.campaign_name), (k) => k);

  return { market, currency, start, end, generatedAt: new Date().toISOString(), kpis, series, campaigns, byType };
}

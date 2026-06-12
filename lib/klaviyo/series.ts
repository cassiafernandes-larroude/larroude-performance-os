// Helpers para gerar séries diárias/semanais a partir de CampaignRow[].
// Flows não suportam daily breakdown na API do Klaviyo — usamos só weekly aggregate.
import type { CampaignRow, Period } from '@/types/klaviyo/models';
import { bucketDate, type Granularity } from './utils';

export interface SeriesPoint {
  date: string;
  revenue: number;
  recipients: number;
  opens: number;
  clicks: number;
  conversions: number;
  campaigns: number;        // count
  openRate: number;         // weighted avg
  clickRate: number;        // weighted avg
  rpr: number;              // revenue / recipients
  inPeriod?: boolean;
}

export function granularityForPeriod(period: Period, rangeDays?: number): Granularity {
  if (period === 'CUSTOM' && typeof rangeDays === 'number') {
    if (rangeDays <= 40) return 'day';
    if (rangeDays <= 90) return 'week';
    return 'month';
  }
  if (period === '3M') return 'week';
  if (period === '6M' || period === '12M') return 'month';
  return 'day';
}

export function bucketCampaigns(rows: CampaignRow[], granularity: Granularity): SeriesPoint[] {
  const m = new Map<string, SeriesPoint>();
  for (const r of rows) {
    if (!r.sendDate) continue;
    const date = bucketDate(r.sendDate.slice(0, 10), granularity);
    let p = m.get(date);
    if (!p) {
      p = { date, revenue: 0, recipients: 0, opens: 0, clicks: 0, conversions: 0, campaigns: 0, openRate: 0, clickRate: 0, rpr: 0, inPeriod: true };
      m.set(date, p);
    }
    p.revenue += r.revenue;
    p.recipients += r.recipients;
    p.opens += r.opens;
    p.clicks += r.clicks;
    p.conversions += r.conversions;
    p.campaigns += 1;
  }
  const out = Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
  for (const p of out) {
    p.openRate = p.recipients ? (p.opens / p.recipients) * 100 : 0;
    p.clickRate = p.recipients ? (p.clicks / p.recipients) * 100 : 0;
    p.rpr = p.recipients ? p.revenue / p.recipients : 0;
  }
  return out;
}

// Para o KPI Overtime - Camps vs Flows L90D weekly:
// fallback quando flow-series-reports não está disponível
export function distributeFlowsWeekly(flowsTotal: { revenue: number; recipients: number; opens: number; clicks: number; conversions: number }, weekCount: number): SeriesPoint[] {
  if (weekCount <= 0) return [];
  const per = {
    revenue: flowsTotal.revenue / weekCount,
    recipients: flowsTotal.recipients / weekCount,
    opens: flowsTotal.opens / weekCount,
    clicks: flowsTotal.clicks / weekCount,
    conversions: flowsTotal.conversions / weekCount,
  };
  const out: SeriesPoint[] = [];
  for (let i = 0; i < weekCount; i++) {
    out.push({
      date: '', // caller sets
      revenue: per.revenue, recipients: per.recipients, opens: per.opens, clicks: per.clicks, conversions: per.conversions,
      campaigns: 0,
      openRate: per.recipients ? (per.opens / per.recipients) * 100 : 0,
      clickRate: per.recipients ? (per.clicks / per.recipients) * 100 : 0,
      rpr: per.recipients ? per.revenue / per.recipients : 0,
      inPeriod: true
    });
  }
  return out;
}

// Parser para /flow-series-reports/ — agrega todos os flows por data
export function parseFlowSeries(report: any): SeriesPoint[] {
  const attrs = report?.data?.attributes;
  if (!attrs) return [];
  const dateTimes: string[] = attrs.date_times || [];
  const results: any[] = attrs.results || [];
  const byIdx: SeriesPoint[] = dateTimes.map(dt => ({
    date: dt.slice(0, 10), revenue: 0, recipients: 0, opens: 0, clicks: 0, conversions: 0, campaigns: 0,
    openRate: 0, clickRate: 0, rpr: 0, inPeriod: true
  }));

  for (const r of results) {
    const stats: Record<string, number[]> = r.statistics || {};
    const revArr = stats['conversion_value'] || [];
    const recArr = stats['recipients'] || [];
    const opArr = stats['opens_unique'] || [];
    const clkArr = stats['clicks_unique'] || [];
    const convArr = stats['conversions'] || [];
    for (let i = 0; i < byIdx.length; i++) {
      byIdx[i].revenue += revArr[i] || 0;
      byIdx[i].recipients += recArr[i] || 0;
      byIdx[i].opens += opArr[i] || 0;
      byIdx[i].clicks += clkArr[i] || 0;
      byIdx[i].conversions += convArr[i] || 0;
    }
  }
  for (const p of byIdx) {
    p.openRate = p.recipients ? (p.opens / p.recipients) * 100 : 0;
    p.clickRate = p.recipients ? (p.clicks / p.recipients) * 100 : 0;
    p.rpr = p.recipients ? p.revenue / p.recipients : 0;
  }
  return byIdx;
}

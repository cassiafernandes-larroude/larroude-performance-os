// Helpers para comparações vs prior period e YoY.
import type { DateRange } from '@/types/klaviyo/models';

export function priorRange(range: DateRange): DateRange {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const length = end - start;
  const priorEnd = new Date(start - 1).toISOString();
  const priorStart = new Date(start - 1 - length).toISOString();
  return { start: priorStart, end: priorEnd };
}

export function yoyRange(range: DateRange): DateRange {
  const start = new Date(range.start);
  const end = new Date(range.end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  end.setUTCFullYear(end.getUTCFullYear() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function pctChange(curr: number, prev: number): number | null {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export interface DeltaTotals {
  revenue: number;
  recipients: number;
  opens: number;
  clicks: number;
  conversions: number;
  delivered: number;
  openRate: number;
  clickRate: number;
  rpr: number;
}

export function emptyTotals(): DeltaTotals {
  return { revenue: 0, recipients: 0, opens: 0, clicks: 0, conversions: 0, delivered: 0, openRate: 0, clickRate: 0, rpr: 0 };
}

export function totalsFromRows(rows: any[]): DeltaTotals {
  const t = emptyTotals();
  for (const r of rows) {
    t.revenue += r.revenue || 0;
    t.recipients += r.recipients || 0;
    t.opens += r.opens || 0;
    t.clicks += r.clicks || 0;
    t.conversions += r.conversions || 0;
    t.delivered += r.delivered || r.recipients || 0;
  }
  t.openRate = t.delivered ? (t.opens / t.delivered) * 100 : 0;
  t.clickRate = t.delivered ? (t.clicks / t.delivered) * 100 : 0;
  t.rpr = t.recipients ? t.revenue / t.recipients : 0;
  return t;
}

export function deltaBlock(current: DeltaTotals, prior: DeltaTotals, yoy: DeltaTotals) {
  return {
    revenue:     { value: current.revenue,     prior: pctChange(current.revenue,     prior.revenue),     yoy: pctChange(current.revenue,     yoy.revenue) },
    recipients:  { value: current.recipients,  prior: pctChange(current.recipients,  prior.recipients),  yoy: pctChange(current.recipients,  yoy.recipients) },
    clicks:      { value: current.clicks,      prior: pctChange(current.clicks,      prior.clicks),      yoy: pctChange(current.clicks,      yoy.clicks) },
    conversions: { value: current.conversions, prior: pctChange(current.conversions, prior.conversions), yoy: pctChange(current.conversions, yoy.conversions) },
    openRate:    { value: current.openRate,    prior: pctChange(current.openRate,    prior.openRate),    yoy: pctChange(current.openRate,    yoy.openRate) },
    clickRate:   { value: current.clickRate,   prior: pctChange(current.clickRate,   prior.clickRate),   yoy: pctChange(current.clickRate,   yoy.clickRate) },
    rpr:         { value: current.rpr,         prior: pctChange(current.rpr,         prior.rpr),         yoy: pctChange(current.rpr,         yoy.rpr) }
  };
}

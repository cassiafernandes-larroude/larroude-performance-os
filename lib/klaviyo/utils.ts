// Utilidades de formatação + período para charts diários
import type { Market } from '@/types/klaviyo/models';

export type Granularity = 'day' | 'week' | 'month';
export type PeriodKey = 'L1D' | 'L7D' | 'L14D' | 'L28D' | 'L60D' | 'L90D' | '3M' | '6M' | '12M' | 'CUSTOM';
export interface PeriodRange { start: string; end: string; days: number; }

export function fmtCurrency(v: number, market: Market, opts?: { compact?: boolean }): string {
  const symbol = market === 'BR' ? 'R$' : '$';
  if (opts?.compact) {
    if (Math.abs(v) >= 1_000_000) return `${symbol}${(v/1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${symbol}${(v/1_000).toFixed(1)}k`;
  }
  return symbol + Math.round(v).toLocaleString(market === 'BR' ? 'pt-BR' : 'en-US');
}

export function fmtPercent(v: number, decimals = 1): string {
  // aceita tanto 0.0131 quanto 1.31 — heurística: se < 1, multiplica
  const x = Math.abs(v) <= 1 ? v * 100 : v;
  return `${x.toFixed(decimals)}%`;
}

export function fmtNumber(v: number): string { return Math.round(v).toLocaleString('en-US'); }
export function fmtMultiple(v: number): string { return `${v.toFixed(2)}×`; }

export function fmtAxisDate(iso: string, gran: Granularity): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  if (gran === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (gran === 'week') {
    const end = new Date(d); end.setUTCDate(end.getUTCDate() + 6);
    const m = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${m} ${d.getUTCDate()}-${end.getUTCDate()}`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function safeDiv(a: number, b: number): number { return b ? a / b : 0; }
export function pctChange(curr: number, prev: number): number | null { if (!prev) return null; return ((curr - prev) / prev) * 100; }

export function granularityFor(periodKey: PeriodKey): Granularity {
  if (periodKey === '3M' || periodKey === 'L90D') return 'week';
  if (periodKey === '6M' || periodKey === '12M') return 'month';
  return 'day';
}

export function granularityForCustom(days: number): Granularity {
  if (days <= 40) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

export function calcPeriod(periodKey: PeriodKey, endDate?: string): PeriodRange {
  const end = endDate ? new Date(endDate + 'T23:59:59Z') : new Date();
  const days =
    periodKey === 'L1D' ? 1 :
    periodKey === 'L7D' ? 7 :
    periodKey === 'L14D' ? 14 :
    periodKey === 'L28D' ? 28 :
    periodKey === 'L60D' ? 60 :
    periodKey === 'L90D' ? 90 :
    periodKey === '3M' ? 90 :
    periodKey === '6M' ? 180 :
    periodKey === '12M' ? 365 : 28;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
}

// Bucketização Monday-ISO igual DATE_TRUNC(d, WEEK(MONDAY)) do BigQuery
export function bucketDate(iso: string, gran: Granularity): string {
  if (!iso) return iso;
  if (gran === 'day') return iso;
  if (gran === 'month') return iso.slice(0, 7) + '-01';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  const dow = d.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// Lista de buckets ordenados — usar quando estendemos pra mostrar contexto fora do período
export function buildDateList(buckets: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(buckets))).sort();
}

export function inPeriodFlag(date: string, period: PeriodRange): boolean {
  return date >= period.start && date <= period.end;
}

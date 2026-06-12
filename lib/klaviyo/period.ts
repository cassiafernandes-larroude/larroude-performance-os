import type { Period, DateRange, CustomRange } from '@/types/klaviyo/models';

export function periodToRange(period: Period, custom?: CustomRange, now = new Date()): DateRange {
  if (period === 'CUSTOM' && custom?.start && custom?.end) {
    const s = new Date(custom.start + 'T00:00:00Z');
    const e = new Date(custom.end + 'T23:59:59Z');
    return { start: s.toISOString(), end: e.toISOString() };
  }
  const days =
    period === 'L1D' ? 1 :
    period === 'L7D' ? 7 :
    period === 'L28D' ? 28 :
    period === '3M' ? 90 :
    period === '6M' ? 180 :
    period === '12M' ? 365 : 28;
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function isoMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function weeklyBuckets(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  let cursor = new Date(isoMonday(s));
  while (cursor <= e) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
}

// Calcula nº de dias do range (para granularidade do chart)
export function rangeDays(range: DateRange): number {
  const s = new Date(range.start).getTime();
  const e = new Date(range.end).getTime();
  return Math.max(1, Math.ceil((e - s) / 86400000));
}

import type { Period, DateRange } from './types';

export type Granularity = 'day' | 'week' | 'month';

/**
 * Determines the bucket granularity for chart bars based on window size:
 *   ≤ 28 dias   → day   (uma barra por dia)
 *   29-90 dias  → week  (DATE_TRUNC(d, WEEK(MONDAY)) — uma barra por semana, Segunda-feira)
 *   > 90 dias   → month (DATE_TRUNC(d, MONTH) — uma barra por mês)
 *
 * Funciona para PRESETS e para CUSTOM RANGE: a regra é só sobre o tamanho da janela.
 * Exemplo:
 *   - 01/05/2026 → 21/05/2026 (21 dias) → day
 *   - 01/01/2026 → 30/04/2026 (120 dias) → month
 */
export function granularityForPeriod(period: Period, range?: DateRange): Granularity {
  const r = range ?? periodToRange(period);
  const days = diffDays(r.since, r.until);
  if (days <= 28) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

/** Monday-truncated start of week for the given ISO date (UTC). */
export function weekMondayISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** First-day-of-month for the given ISO date. */
export function monthStartISO(iso: string): string {
  return iso.slice(0, 7) + '-01';
}

/** Returns bucket key function for the given granularity. */
export function bucketKey(gran: Granularity): (iso: string) => string {
  if (gran === 'week')  return weekMondayISO;
  if (gran === 'month') return monthStartISO;
  return (iso: string) => iso;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(since: string, until: string): number {
  const a = new Date(since + 'T00:00:00Z').getTime();
  const b = new Date(until + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export function periodToRange(period: Period, refUntil?: string): DateRange {
  const until = refUntil ?? todayISO();
  let days = 28;
  switch (period) {
    case '1d':  days = 1; break;
    case '7d':  days = 7; break;
    case '14d': days = 14; break;
    case '28d': days = 28; break;
    case '3M':  days = 90; break;
    case '6M':  days = 180; break;
    case '12M': days = 365; break;
  }
  return { since: shiftISO(until, -(days - 1)), until };
}

export function previousRange(range: DateRange): DateRange {
  const len = diffDays(range.since, range.until);
  return {
    since: shiftISO(range.since, -len),
    until: shiftISO(range.until, -len),
  };
}

export function listDates(range: DateRange): string[] {
  const out: string[] = [];
  let cur = range.since;
  while (cur <= range.until) {
    out.push(cur);
    cur = shiftISO(cur, 1);
  }
  return out;
}

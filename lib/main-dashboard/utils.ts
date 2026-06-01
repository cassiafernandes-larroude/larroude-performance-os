// Utilitários de formatação e cálculo de períodos
import type { Granularity, Market, PeriodKey, PeriodRange } from './types';

/**
 * Decide a granularidade ideal de agrupamento conforme o período.
 *  - 7d/14d/28d → diário (cada barra é um dia)
 *  - 3M → semanal (cada barra é uma semana ISO)
 *  - 6M/12M → mensal (cada barra é um mês)
 */
export function granularityFor(periodKey: PeriodKey): Granularity {
  if (periodKey === '3M') return 'week';
  if (periodKey === '6M' || periodKey === '12M') return 'month';
  return 'day';
}

export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Converte uma string YYYY-MM-DD para Date em UTC sem timezone surprises */
export function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, day));
}

export function formatISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Calcula o período rolling baseado no end date (default: ontem)
 * e o período anterior comparável.
 */
export function calcPeriod(periodKey: PeriodKey, endDate?: string): PeriodRange {
  const end = endDate ? parseISO(endDate) : shiftDays(parseISO(todayISO()), -1);
  let days = 28;
  switch (periodKey) {
    case '1d': days = 1; break;
    case '7d': days = 7; break;
    case '14d': days = 14; break;
    case '28d': days = 28; break;
    case '60d': days = 60; break;
    case '90d': days = 90; break;
    case '3M': days = 90; break;
    case '6M': days = 180; break;
    case '12M': days = 365; break;
  }
  const start = shiftDays(end, -(days - 1));
  const prevEnd = shiftDays(start, -1);
  const prevStart = shiftDays(prevEnd, -(days - 1));
  return {
    start: formatISO(start),
    end: formatISO(end),
    days,
    prevStart: formatISO(prevStart),
    prevEnd: formatISO(prevEnd),
  };
}

export function currencySymbol(market: Market): string {
  return market === 'US' ? '$' : 'R$';
}

export function fmtCurrency(value: number, market: Market, opts: { compact?: boolean } = {}): string {
  if (value == null || isNaN(value)) return '—';
  const symbol = currencySymbol(market);
  if (opts.compact) {
    if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  }
  return `${symbol}${value.toLocaleString(market === 'US' ? 'en-US' : 'pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: value < 10 ? 2 : 0,
  })}`;
}

export function fmtNumber(value: number, decimals = 0): string {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPercent(value: number, decimals = 1): string {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function fmtMultiple(value: number): string {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(2)}×`;
}

export function fmtDelta(delta: number | null | undefined): { text: string; sign: 'up' | 'down' | 'flat' } {
  if (delta == null || isNaN(delta)) return { text: '—', sign: 'flat' };
  const pct = delta * 100;
  if (Math.abs(pct) < 0.05) return { text: '0.0%', sign: 'flat' };
  const sign = pct > 0 ? 'up' : 'down';
  return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, sign };
}

export function pctChange(curr: number, prev: number): number | null {
  if (prev == null || prev === 0 || isNaN(prev)) return null;
  return (curr - prev) / prev;
}

export function safeDiv(num: number, den: number): number {
  if (!den) return 0;
  return num / den;
}

/** Formata "Mar 19" para tooltip de eixo X (datas ISO).
 * Aceita granularidade opcional:
 *  - 'day'   → "Mar 19"
 *  - 'week'  → "Mar 17-23"
 *  - 'month' → "Mar 2026"
 */
export function fmtAxisDate(iso: string, granularity: Granularity = 'day'): string {
  const d = parseISO(iso);
  const m = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  if (granularity === 'month') {
    return `${m} ${d.getUTCFullYear()}`;
  }
  if (granularity === 'week') {
    const end = new Date(d.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
    const m2 = end.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return m === m2
      ? `${m} ${d.getUTCDate()}-${end.getUTCDate()}`
      : `${m} ${d.getUTCDate()}-${m2} ${end.getUTCDate()}`;
  }
  return `${m} ${d.getUTCDate()}`;
}

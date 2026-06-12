/**
 * Period filter helpers para Klaviyo dashboard.
 * Igual ao Main Dashboard (Cassia 2026-06-12).
 */

import type { Period, DateRange } from './types';
import { yesterdayInMarket } from '@/lib/utils/market-tz';
import type { Market } from './types';

export function periodToRange(period: Period, market: Market = 'US', customStart?: string, customEnd?: string): DateRange {
  if (period === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }
  const end = yesterdayInMarket(market); // D-1 no fuso do market
  const days =
    period === '1d' ? 1 :
    period === '7d' ? 7 :
    period === '14d' ? 14 :
    period === '28d' ? 28 :
    period === '3M' ? 90 :
    period === '6M' ? 180 :
    period === '12M' ? 365 : 28;
  const endDate = new Date(end + 'T00:00:00Z');
  const startDate = new Date(endDate.getTime() - (days - 1) * 86400000);
  return {
    start: startDate.toISOString().slice(0, 10),
    end,
  };
}

export function priorRange(range: DateRange): DateRange {
  const start = new Date(range.start + 'T00:00:00Z');
  const end = new Date(range.end + 'T00:00:00Z');
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const priorEnd = new Date(start.getTime() - 86400000);
  const priorStart = new Date(priorEnd.getTime() - (days - 1) * 86400000);
  return {
    start: priorStart.toISOString().slice(0, 10),
    end: priorEnd.toISOString().slice(0, 10),
  };
}

export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Converte YYYY-MM-DD para datetime ISO completo no fuso UTC.
 * Klaviyo filter exige formato `2026-06-01T00:00:00Z`.
 */
export function toKlaviyoDatetime(d: string, endOfDay = false): string {
  return endOfDay ? `${d}T23:59:59Z` : `${d}T00:00:00Z`;
}

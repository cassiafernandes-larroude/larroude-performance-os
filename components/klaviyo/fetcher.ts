import type { Market, Period } from '@/lib/klaviyo/types';

export function buildKlaviyoUrl(
  endpoint: string,
  market: Market,
  period: Period,
  customRange?: { from: string; to: string },
): string {
  const params = new URLSearchParams();
  params.set('period', period);
  if (period === 'custom' && customRange) {
    params.set('from', customRange.from);
    params.set('to', customRange.to);
  }
  return `/api/klaviyo/${endpoint}/${market}?${params.toString()}`;
}

export function fmtMoney(value: number, market: Market, compact = false): string {
  const symbol = market === 'US' ? '$' : 'R$';
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  }
  return `${symbol}${Math.round(value).toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')}`;
}

export function fmtPct(v: number, digits = 2): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNumber(n: number, market: Market = 'US'): string {
  return Math.round(n).toLocaleString(market === 'US' ? 'en-US' : 'pt-BR');
}

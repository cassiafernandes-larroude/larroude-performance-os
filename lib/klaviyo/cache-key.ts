import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

export function key(...parts: (string|number|undefined)[]) { return parts.filter(Boolean).join(':'); }
export function tag(market: Market, scope: string) { return `crm:${market}:${scope}`; }

const VALID_PERIODS: Period[] = ['L1D','L7D','L28D','3M','6M','12M','CUSTOM'];

export function readParams(searchParams: URLSearchParams): { market: Market; period: Period; custom?: CustomRange } {
  const m = (searchParams.get('market') || 'US').toUpperCase() as Market;
  const pRaw = (searchParams.get('period') || 'L28D').toUpperCase();
  // Aceitar legados L60D / L90D vindos de cache antigo (mapear para 3M)
  const p = (pRaw === 'L60D' || pRaw === 'L90D' ? '3M' : pRaw) as Period;
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';
  const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const custom = (isValidDate(start) && isValidDate(end)) ? { start, end } : undefined;
  return {
    market: (m === 'BR' ? 'BR' : 'US'),
    period: (VALID_PERIODS.includes(p) ? p : 'L28D') as Period,
    custom
  };
}

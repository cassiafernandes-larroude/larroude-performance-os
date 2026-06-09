import type { Market } from './queries';

const FORMATTERS: Record<Market, Intl.NumberFormat> = {
  US: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  BR: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }),
};

const FORMATTERS_DECIMAL: Record<Market, Intl.NumberFormat> = {
  US: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  BR: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

export function formatMoney(value: number, market: Market, decimals = false): string {
  if (!isFinite(value) || value === 0) return market === 'US' ? '$0' : 'R$ 0';
  return (decimals ? FORMATTERS_DECIMAL : FORMATTERS)[market].format(value);
}

const NUM_BR = new Intl.NumberFormat('pt-BR');
const NUM_US = new Intl.NumberFormat('en-US');

export function formatNumber(value: number, market: Market): string {
  if (!isFinite(value)) return '—';
  return (market === 'US' ? NUM_US : NUM_BR).format(value);
}

export function formatDate(iso: string, market: Market): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(market === 'US' ? 'en-US' : 'pt-BR', { month: 'short', day: '2-digit' });
}

export function formatMonth(yyyymm: string, market: Market): string {
  const [y, m] = yyyymm.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(market === 'US' ? 'en-US' : 'pt-BR', { month: 'short', year: '2-digit' });
}

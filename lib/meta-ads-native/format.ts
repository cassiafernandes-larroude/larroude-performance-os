export function formatCurrency(
  value: number,
  currency: string = 'USD',
  compact: boolean = false
): string {
  if (value == null || isNaN(value)) return '—';
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? 'compact' : 'standard',
  };
  return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', opts).format(value);
}

export function formatNumber(value: number, compact: boolean = false): string {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatPercent(value: number, digits: number = 1): string {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatDecimal(value: number, digits: number = 1): string {
  if (value == null || isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function formatDelta(delta?: number): { text: string; positive: boolean } {
  if (delta == null || isNaN(delta)) return { text: '—', positive: true };
  const sign = delta >= 0 ? '+' : '';
  return { text: `${sign}${delta.toFixed(1)}%`, positive: delta >= 0 };
}

export function formatKpi(kpi: { value: number; format: string; prefix?: string; suffix?: string }, currency = 'USD'): string {
  const compact = kpi.value >= 1000;
  switch (kpi.format) {
    case 'currency': return formatCurrency(kpi.value, currency, true);
    case 'number':   return (kpi.prefix ?? '') + formatNumber(kpi.value, true) + (kpi.suffix ?? '');
    case 'integer':  return (kpi.prefix ?? '') + formatNumber(kpi.value, false) + (kpi.suffix ?? '');
    case 'percent':  return formatPercent(kpi.value);
    case 'decimal':  return formatDecimal(kpi.value);
    default:         return String(kpi.value);
  }
}

export function formatDate(d: string | Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (format === 'iso') return date.toISOString().slice(0, 10);
  if (format === 'long') {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

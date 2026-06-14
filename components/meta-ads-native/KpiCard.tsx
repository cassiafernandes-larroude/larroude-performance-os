'use client';
import { cn } from '@/lib/meta-ads-native/cn';
import { formatDelta, formatKpi } from '@/lib/meta-ads-native/format';
import type { Kpi } from '@/lib/meta-ads-native/types';

interface Props {
  kpi: Kpi;
  currency?: string;
  hint?: string;
  comparisonLabel?: string;
}

export default function KpiCard({ kpi, currency, hint, comparisonLabel = 'vs prev.' }: Props) {
  const delta = formatDelta(kpi.delta);
  return (
    <div className="card flex flex-col">
      {/* Label has min-height to reserve 2 lines, so values align across cards */}
      <div className="kpi-label">{kpi.label}</div>

      {/* Value */}
      <div className="kpi-value mt-1">{formatKpi(kpi, currency)}</div>

      {/* Delta */}
      <div className="mt-1.5 min-h-[18px]">
        {kpi.delta != null && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className={cn(delta.positive ? 'kpi-delta-up' : 'kpi-delta-down')}>
              {delta.positive ? '▲' : '▼'} {delta.text}
            </span>
            <span className="text-[11px] text-ink-400">{comparisonLabel}</span>
          </div>
        )}
      </div>

      {/* Hint */}
      {hint && <div className="mt-1 text-[11px] text-ink-400 leading-tight">{hint}</div>}
    </div>
  );
}

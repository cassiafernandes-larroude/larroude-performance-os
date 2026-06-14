'use client';
// Cassia 2026-06-14: KpiCard padronizado com Main Dashboard
// — mesmo layout grid 38/30/auto, label uppercase, tabular numeric, delta com seta + cor.
import { formatKpi, formatDelta } from '@/lib/meta-ads-native/format';
import type { Kpi } from '@/lib/meta-ads-native/types';

interface Props {
  kpi: Kpi;
  currency?: string;
  hint?: string;
  comparisonLabel?: string;
}

export default function KpiCard({ kpi, currency, hint, comparisonLabel = 'vs prior' }: Props) {
  const delta = kpi.delta != null ? formatDelta(kpi.delta) : null;
  const isUp = delta?.positive === true;
  const isDown = delta?.positive === false;
  const arrow = isUp ? '▲' : isDown ? '▼' : '·';
  const deltaColor = isUp ? '#10b981' : isDown ? '#ef4444' : '#9ca3af';

  return (
    <div
      className="card"
      style={{
        padding: '10px 12px',
        display: 'grid',
        gridTemplateRows: '38px 30px auto',
        rowGap: 4,
        minHeight: 110,
      }}
    >
      <div
        className="text-[8.5px] font-bold tracking-wider text-steel uppercase leading-tight"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          alignSelf: 'start',
        }}
      >
        {kpi.label}
      </div>
      <div
        className="text-xl font-bold text-ink leading-tight"
        style={{
          alignSelf: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatKpi(kpi, currency)}
      </div>
      <div className="text-[9px] font-medium leading-tight" style={{ alignSelf: 'end', minHeight: 14 }}>
        {delta ? (
          <span style={{ color: deltaColor }}>
            <span className="mr-1">{arrow}</span>
            <span>{delta.text} {comparisonLabel}</span>
          </span>
        ) : hint ? (
          <span className="text-steel">{hint}</span>
        ) : (
          <span style={{ color: 'transparent' }}>·</span>
        )}
      </div>
    </div>
  );
}

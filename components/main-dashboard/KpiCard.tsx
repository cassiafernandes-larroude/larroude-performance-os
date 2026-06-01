'use client';

import type { KpiValue } from '@/lib/main-dashboard/types';
import { fmtDelta } from '@/lib/main-dashboard/utils';

interface Props { kpi: KpiValue; }

export default function KpiCard({ kpi }: Props) {
  const d = fmtDelta(kpi.delta);
  const isUp = d.sign === 'up';
  const isDown = d.sign === 'down';
  const positive = kpi.invertDelta ? isDown : isUp;
  const negative = kpi.invertDelta ? isUp : isDown;
  const arrow = isUp ? '▲' : isDown ? '▼' : '·';
  const deltaColor = positive ? '#10b981' : negative ? '#ef4444' : '#9ca3af';

  return (
    <div className="card p-2.5 flex flex-col">
      <div className="text-[8.5px] font-bold tracking-wider text-steel uppercase leading-tight min-h-[20px]">
        {kpi.label}
      </div>
      <div className="text-xl font-bold text-ink leading-tight mt-0.5">{kpi.value}</div>
      {kpi.delta != null ? (
        <div className="text-[9px] font-medium mt-0.5" style={{ color: deltaColor }}>
          <span className="mr-1">{arrow}</span>
          <span>{d.text} vs anterior</span>
        </div>
      ) : kpi.hint ? (
        <div className="text-[9px] text-steel mt-0.5 leading-tight">{kpi.hint}</div>
      ) : (
        <div className="text-[9px] text-transparent mt-0.5">·</div>
      )}
    </div>
  );
}

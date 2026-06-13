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
    <div className="card p-2.5 flex flex-col" style={{ minHeight: 96 }}>
      {/* Label: 2 linhas garantidas - valores ficam alinhados horizontalmente
          independente do label ter 1 ou 2 linhas (Cassia 2026-06-13: "alinhe os kpis") */}
      <div
        className="text-[8.5px] font-bold tracking-wider text-steel uppercase leading-tight"
        style={{
          minHeight: 28,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {kpi.label}
      </div>
      <div className="text-xl font-bold text-ink leading-tight mt-0.5">{kpi.value}</div>
      <div className="mt-auto pt-1">
        {kpi.delta != null ? (
          <div className="text-[9px] font-medium leading-tight" style={{ color: deltaColor, minHeight: 14 }}>
            <span className="mr-1">{arrow}</span>
            <span>{d.text} vs prior</span>
          </div>
        ) : kpi.hint ? (
          <div className="text-[9px] text-steel leading-tight" style={{ minHeight: 14 }}>{kpi.hint}</div>
        ) : (
          <div className="text-[9px] text-transparent" style={{ minHeight: 14 }}>·</div>
        )}
      </div>
    </div>
  );
}

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
    // Cassia 2026-06-13: "alinhe os kpis" — grid de 3 linhas com alturas FIXAS
    // garante que o valor sempre fica na mesma linha horizontal entre todos os cards
    // independente do tamanho do label.
    //
    //   row 1: LABEL  (altura FIXA 38px - acomoda 3 linhas de 8.5px+leading-tight)
    //   row 2: VALUE  (altura FIXA 28px - texto-xl com leading-tight)
    //   row 3: DELTA  (altura FIXA auto - reserva 1 linha)
    <div
      className="card"
      style={{
        padding: "10px 12px",
        display: "grid",
        gridTemplateRows: "38px 30px auto",
        rowGap: 4,
        minHeight: 110,
      }}
    >
      <div
        className="text-[8.5px] font-bold tracking-wider text-steel uppercase leading-tight"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          alignSelf: "start",
        }}
      >
        {kpi.label}
      </div>
      <div
        className="text-xl font-bold text-ink leading-tight"
        style={{
          alignSelf: "center",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {kpi.value}
      </div>
      <div className="text-[9px] font-medium leading-tight" style={{ alignSelf: "end", minHeight: 14 }}>
        {kpi.delta != null ? (
          <span style={{ color: deltaColor }}>
            <span className="mr-1">{arrow}</span>
            <span>{d.text} vs prior</span>
          </span>
        ) : kpi.hint ? (
          <span className="text-steel">{kpi.hint}</span>
        ) : (
          <span style={{ color: "transparent" }}>·</span>
        )}
      </div>
    </div>
  );
}

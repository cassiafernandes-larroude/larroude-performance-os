'use client';

import type { DailyPoint, Market } from '@/lib/klaviyo/types';
import { fmtMoney, fmtNumber, fmtPct } from './fetcher';

interface Series { name: string; color: string; data: DailyPoint[]; }

interface Props {
  title: string;
  series: Series[];
  unit?: 'currency' | 'number' | 'percent';
  market: Market;
  height?: number;
}

/**
 * MultiLineChart pure SVG. Para visualizar Por Step (1 linha por step do flow).
 */
export default function MultiLineChart({ title, series, unit = 'number', market, height = 240 }: Props) {
  if (!series.length || series.every((s) => s.data.length === 0)) {
    return (
      <div className="card p-4 flex flex-col items-center justify-center text-[12px] italic" style={{ color: '#9ca3af', minHeight: height }}>
        {title} — no data
      </div>
    );
  }
  // Coleta todas as datas
  const dateSet = new Set<string>();
  series.forEach((s) => s.data.forEach((p) => dateSet.add(p.date)));
  const dates = Array.from(dateSet).sort();
  const max = Math.max(...series.flatMap((s) => s.data.map((p) => p.value)), 1);
  const chartH = height - 60;
  const chartW = 720;
  const stepX = dates.length > 1 ? chartW / (dates.length - 1) : chartW;

  const fmt = (v: number) => {
    if (unit === 'currency') return fmtMoney(v, market, true);
    if (unit === 'percent') return fmtPct(v, 1);
    return fmtNumber(v, market);
  };

  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${chartW} ${chartH + 16}`} preserveAspectRatio="xMidYMid meet" width="100%" height={chartH + 16}>
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1="0" x2={chartW} y1={chartH * p} y2={chartH * p} stroke="#efece6" strokeWidth={1} />
        ))}
        {/* Linhas */}
        {series.map((s, sIdx) => {
          const byDate = new Map(s.data.map((p) => [p.date, p.value]));
          const points = dates.map((d, i) => {
            const v = byDate.get(d) ?? 0;
            const x = i * stepX;
            const y = chartH - (v / max) * chartH;
            return `${x},${y}`;
          });
          return (
            <polyline
              key={sIdx}
              points={points.join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
            >
              <title>{s.name}</title>
            </polyline>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 text-[10px]" style={{ color: '#374151' }}>
        {series.map((s) => (
          <div key={s.name} className="flex items-center gap-1">
            <div style={{ width: 10, height: 3, background: s.color, borderRadius: 1 }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9px] mt-1" style={{ color: '#9ca3af' }}>
        <span>{dates[0]}</span>
        <span>{dates[dates.length - 1]}</span>
      </div>
    </div>
  );
}

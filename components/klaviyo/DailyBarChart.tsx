'use client';

import type { DailyPoint, Market } from '@/lib/klaviyo/types';
import { fmtMoney, fmtNumber, fmtPct } from './fetcher';

interface Props {
  title: string;
  data: DailyPoint[];
  color?: string;
  unit?: 'currency' | 'number' | 'percent';
  market: Market;
  height?: number;
}

/**
 * DailyBarChart pure SVG (sem Chart.js extra) — leve, responsivo.
 * Value labels no topo de cada barra (igual PDF do guia).
 */
export default function DailyBarChart({
  title,
  data,
  color = '#ec4899',
  unit = 'number',
  market,
  height = 200,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="card p-4 flex flex-col items-center justify-center text-[12px] italic" style={{ color: '#9ca3af', minHeight: height }}>
        {title} — no data
      </div>
    );
  }
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const chartH = height - 40; // espaço título + labels
  const barW = 100 / data.length;

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
      <svg width="100%" height={chartH + 16} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * chartH);
          const x = i * barW;
          const y = chartH - h;
          const showLabel = d.value > 0 && data.length <= 31;
          return (
            <g key={d.date}>
              <rect
                x={`${x + barW * 0.1}%`}
                y={y}
                width={`${barW * 0.8}%`}
                height={h}
                fill={color}
                rx={2}
              >
                <title>{d.date}: {fmt(d.value)}</title>
              </rect>
              {showLabel && (
                <text
                  x={`${x + barW / 2}%`}
                  y={y - 2}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#6b7280"
                >
                  {fmt(d.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] mt-1" style={{ color: '#9ca3af' }}>
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

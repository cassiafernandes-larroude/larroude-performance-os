'use client';

import { useEffect, useRef } from 'react';
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import type { DailyPoint, Market } from '@/lib/main-dashboard/types';
import { fmtAxisDate, fmtNumber } from '@/lib/main-dashboard/utils';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface Series { key: string; label: string; data: DailyPoint[]; color: string; }

interface Props {
  title: string;
  series: Series[];
  market: Market;
  height?: number;
}

export default function DailyMultiBarChart({ title, series, market, height = 240 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || series.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // alinha por data — usa a primeira série como referência de datas
    const refDates = series[0].data.map((p) => p.date);
    const labels = refDates.map(fmtAxisDate);

    const datasets = series.map((s) => {
      const map = new Map<string, number>();
      for (const p of s.data) map.set(p.date, p.value);
      return {
        label: s.label,
        data: refDates.map((d) => Number(map.get(d) ?? 0)),
        backgroundColor: s.color,
        borderRadius: 3,
        borderSkipped: false,
        barThickness: 'flex' as const,
        maxBarThickness: 10,
      };
    });

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 16, right: 6, left: 0, bottom: 0 } },
        plugins: {
          legend: { position: 'top', align: 'start',
            labels: { font: { size: 11, weight: '600' }, color: '#3a4a63', boxWidth: 12, boxHeight: 12 } },
          tooltip: { mode: 'index', intersect: false, callbacks: { label: (c) => `${c.dataset.label}: ${fmtNumber(c.parsed.y ?? 0)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#64748b', maxRotation: 45, minRotation: 45 } },
          y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#64748b' }, beginAtZero: true },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [series, title, market]);

  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">{title}</div>
      <div style={{ height }}><canvas ref={canvasRef} /></div>
    </div>
  );
}

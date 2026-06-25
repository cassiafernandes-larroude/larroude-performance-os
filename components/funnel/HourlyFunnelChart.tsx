'use client';
// Cassia 2026-06-25: gráfico de linhas do funil de HOJE por hora (eixo X = hora local, não data).
// MultiLineChart formata os labels como data (fmtAxisDate), por isso este componente dedicado.
import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler,
  type ChartOptions, type ChartData,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

export interface HourSeries { label: string; values: number[]; color?: string }

const FALLBACK = ['#5d4ec5', '#0ea5e9', '#f59e0b', '#10b981'];
const nf = new Intl.NumberFormat('pt-BR');

export default function HourlyFunnelChart({ labels, series, height = 280 }: {
  labels: string[]; series: HourSeries[]; height?: number;
}) {
  const data: ChartData<'line'> = useMemo(() => ({
    labels,
    datasets: series.map((s, i) => {
      const color = s.color || FALLBACK[i % FALLBACK.length];
      return {
        label: s.label,
        data: s.values,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
      };
    }),
  }), [labels, series]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom', align: 'start',
        labels: { font: { size: 10, family: 'Inter' }, boxWidth: 10, boxHeight: 10, padding: 8, usePointStyle: false },
      },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${nf.format(Number(ctx.parsed.y) || 0)}` } },
    },
    scales: {
      x: { ticks: { font: { size: 10 }, color: '#64748b', maxRotation: 0 }, grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 10 }, color: '#64748b', callback: (v) => nf.format(Number(v) || 0) },
        grid: { color: '#eef2f7' },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}

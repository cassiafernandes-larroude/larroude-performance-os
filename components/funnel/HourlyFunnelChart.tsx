'use client';
// Cassia 2026-06-25: gráfico de linhas do funil de HOJE por hora (eixo X = hora local, não data).
// MultiLineChart formata os labels como data (fmtAxisDate), por isso este componente dedicado.
// Cassia 2026-06-25: 2 eixos Y — Sessões (esquerda, milhares) vs Carrinho/Checkout/Pedido (direita,
// escala própria) para as etapas finais não ficarem achatadas sob as sessões.
import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler,
  type ChartOptions, type ChartData,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

export interface HourSeries { label: string; values: number[]; color?: string; axis?: 'left' | 'right' }

const FALLBACK = ['#5d4ec5', '#0ea5e9', '#f59e0b', '#10b981'];
const nf = new Intl.NumberFormat('pt-BR');

export default function HourlyFunnelChart({ labels, series, height = 280 }: {
  labels: string[]; series: HourSeries[]; height?: number;
}) {
  const hasRight = series.some((s) => s.axis === 'right');

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
        yAxisID: s.axis === 'right' ? 'y1' : 'y',
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
        type: 'linear', position: 'left', beginAtZero: true,
        title: { display: true, text: 'Sessões', font: { size: 10 }, color: '#5d4ec5' },
        ticks: { font: { size: 10 }, color: '#64748b', callback: (v) => nf.format(Number(v) || 0) },
        grid: { color: '#eef2f7' },
      },
      ...(hasRight ? {
        y1: {
          type: 'linear' as const, position: 'right' as const, beginAtZero: true,
          title: { display: true, text: 'Carrinho · Checkout · Pedido', font: { size: 10 }, color: '#0ea5e9' },
          ticks: { font: { size: 10 }, color: '#64748b', callback: (v: number | string) => nf.format(Number(v) || 0) },
          grid: { drawOnChartArea: false },
        },
      } : {}),
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}

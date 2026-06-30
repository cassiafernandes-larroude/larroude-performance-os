'use client';
// Cassia 2026-06-29: Receita × Volume no mesmo período (eixo duplo) — pra analisar eficiência:
// se a receita acompanha o volume de envios ou se estamos gerando mais receita por envio (RPR).
// Barras = receita (eixo esq., $); linha = volume de envios (eixo dir., contagem).
import React, { useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, type ChartOptions, type ChartData,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { fmtCurrency, fmtNumber, fmtRpr, fmtAxisDate, type Granularity } from '@/lib/klaviyo/utils';
import type { Market } from '@/types/klaviyo/models';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

export interface RVPoint { date: string; revenue: number; volume: number; }

function inferGranularity(points: RVPoint[]): Granularity {
  if (points.length < 2) return 'day';
  const diff = Math.abs(new Date(points[1].date + 'T00:00:00Z').getTime() - new Date(points[0].date + 'T00:00:00Z').getTime()) / 86400000;
  if (diff >= 27) return 'month';
  if (diff >= 6) return 'week';
  return 'day';
}

const PINK = '#E91E78';
const NAVY = '#1e3a8a';

export default function RevenueVolumeChart({ title, data, market, height = 260 }: { title: string; data: RVPoint[]; market: Market; height?: number }) {
  const gran = useMemo(() => inferGranularity(data), [data]);
  const totalRev = data.reduce((s, p) => s + (p.revenue || 0), 0);
  const totalVol = data.reduce((s, p) => s + (p.volume || 0), 0);
  const rpr = totalVol > 0 ? totalRev / totalVol : 0;

  const chartData: ChartData<'bar' | 'line'> = useMemo(() => ({
    labels: data.map(p => fmtAxisDate(p.date, gran)),
    datasets: [
      { type: 'bar' as const, label: 'Receita', data: data.map(p => p.revenue || 0), backgroundColor: PINK, borderRadius: 3, maxBarThickness: 26, yAxisID: 'yRev', order: 2 },
      { type: 'line' as const, label: 'Volume (envios)', data: data.map(p => p.volume || 0), borderColor: NAVY, backgroundColor: NAVY, borderWidth: 2, pointRadius: 2, tension: 0.3, yAxisID: 'yVol', order: 1 },
    ],
  }), [data, gran]);

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => ctx.dataset.label === 'Receita'
            ? `Receita: ${fmtCurrency(Number(ctx.parsed.y) || 0, market)}`
            : `Volume: ${fmtNumber(Number(ctx.parsed.y) || 0)} envios`,
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45, color: '#0F2237' }, grid: { display: false } },
      yRev: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: market === 'BR' ? 'Receita (R$)' : 'Receita ($)', font: { size: 10 } }, ticks: { font: { size: 10 }, color: '#64748b', callback: (v) => fmtCurrency(Number(v), market, { compact: true }) }, grid: { color: '#eef2f7' } },
      yVol: { type: 'linear', position: 'right', beginAtZero: true, title: { display: true, text: 'Volume', font: { size: 10 } }, ticks: { font: { size: 10 }, color: '#64748b', callback: (v) => fmtNumber(Number(v)) }, grid: { display: false } },
    },
  };

  return (
    <div className="daily-chart-card bg-white border border-line rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: PINK }} />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink2">{title}</h3>
        </div>
        <span className="text-[11px]" style={{ color: '#64748b' }}>
          Eficiência: <b style={{ color: '#1a1a1a' }}>{fmtRpr(rpr, market)}</b> / envio (RPR médio)
        </span>
      </div>
      <div style={{ height }}>
        <Chart type="bar" data={chartData as ChartData<'bar'>} options={options as ChartOptions<'bar'>} />
      </div>
    </div>
  );
}

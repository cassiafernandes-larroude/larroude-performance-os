'use client';
import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Tooltip, Legend,
  type ChartOptions, type ChartData
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { fmtCurrency, fmtPercent, fmtNumber, fmtAxisDate, type Granularity } from '@/lib/klaviyo/utils';
import type { Market } from '@/types/klaviyo/models';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const PALETTE = [
  '#E91E78','#5B3FA0','#0d9488','#B8861F','#B82F2F','#3b82f6','#E8722A','#267838',
  '#2563B8','#1F6F6B','#f59e0b','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316'
];

export interface Series { label: string; values: number[]; color?: string }

interface Props {
  title: string;
  dates: string[];        // pode ser datas YYYY-MM-DD OU labels arbitrárias (S1, S2, ...)
  series: Series[];
  unit: 'currency' | 'number' | 'percent';
  market: Market;
  height?: number;
  stacked?: boolean;
}

function isDateLike(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s);
}

function inferGranularity(dates: string[]): Granularity {
  if (dates.length < 2) return 'day';
  const a = new Date(dates[0] + 'T00:00:00Z').getTime();
  const b = new Date(dates[1] + 'T00:00:00Z').getTime();
  const diff = Math.abs(b - a) / 86400000;
  if (diff >= 27) return 'month';
  if (diff >= 6) return 'week';
  return 'day';
}

function formatValue(v: number, unit: Props['unit'], market: Market): string {
  if (unit === 'currency') return fmtCurrency(v, market, { compact: true });
  if (unit === 'percent') return fmtPercent(v);
  return fmtNumber(v);
}

export default function MultiBarChart({ title, dates, series, unit, market, height = 280, stacked = false }: Props) {
  const gran = useMemo(() => inferGranularity(dates), [dates]);
  const isDates = dates.length > 0 && isDateLike(dates[0]);
  const chartData: ChartData<'bar'> = useMemo(() => ({
    labels: dates.map(d => isDates ? fmtAxisDate(d, gran) : d),
    datasets: series.map((s, i) => ({
      label: s.label,
      data: s.values,
      backgroundColor: s.color || PALETTE[i % PALETTE.length],
      borderWidth: 0,
      borderRadius: 2,
      maxBarThickness: 28
    }))
  }), [dates, series, gran]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        align: 'start',
        labels: { font: { size: 10, family: 'Inter' }, boxWidth: 10, boxHeight: 10, padding: 8 }
      },
      tooltip: {
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatValue(ctx.parsed.y, unit, market)}` }
      }
    },
    scales: {
      x: { stacked, ticks: { font: { size: 10 }, color: '#64748b', maxRotation: 0 }, grid: { display: false } },
      y: {
        stacked, beginAtZero: true,
        ticks: { font: { size: 10 }, color: '#64748b', callback: (v) => formatValue(Number(v), unit, market) },
        grid: { color: '#eef2f7' }
      }
    }
  };

  return (
    <div className="daily-chart-card bg-white border border-line rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink2 mb-3">{title}</h3>
      <div style={{ height }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}

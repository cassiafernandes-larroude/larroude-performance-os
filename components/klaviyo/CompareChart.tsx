'use client';
import React, { useMemo, useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  BarController, LineController,
  Tooltip, Legend, Filler,
  type ChartOptions, type ChartData
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { fmtCurrency, fmtPercent, fmtNumber, fmtAxisDate, type Granularity } from '@/lib/klaviyo/utils';
import type { Market } from '@/types/klaviyo/models';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, BarController, LineController, Tooltip, Legend, Filler);

export interface ComparePoint { date: string; [key: string]: any; }
type Unit = 'currency' | 'number' | 'percent';

interface Dataset {
  label: string;
  field: string;
  color: string;
  type?: 'bar' | 'line';
  yAxisID?: string;
  fill?: boolean;
  dashed?: boolean;
}

interface Props {
  title: string;
  data: ComparePoint[];
  datasets: Dataset[];
  unit: Unit;
  market: Market;
  height?: number;
  stacked?: boolean;
  showLineTotal?: boolean;
  lineTotalField?: string;
  lineTotalLabel?: string;
}

function formatValue(v: number, unit: Unit, market: Market): string {
  if (unit === 'currency') return fmtCurrency(v, market, { compact: true });
  if (unit === 'percent') return fmtPercent(v);
  return fmtNumber(v);
}

function inferGranularity(points: ComparePoint[]): Granularity {
  if (points.length < 2) return 'day';
  const a = new Date(points[0].date + 'T00:00:00Z').getTime();
  const b = new Date(points[1].date + 'T00:00:00Z').getTime();
  const diff = Math.abs(b - a) / 86400000;
  if (diff >= 27) return 'month';
  if (diff >= 6) return 'week';
  return 'day';
}

export default function CompareChart({ title, data, datasets, unit, market, height = 240, stacked = false, showLineTotal = false, lineTotalField, lineTotalLabel = 'Total' }: Props) {
  const granularity = useMemo(() => inferGranularity(data), [data]);
  const [responsiveHeight, setResponsiveHeight] = useState(height);
  useEffect(() => {
    function c() {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      if (w < 460) setResponsiveHeight(Math.min(height, 180));
      else if (w < 720) setResponsiveHeight(Math.min(height, 200));
      else setResponsiveHeight(height);
    }
    c();
    window.addEventListener('resize', c);
    return () => window.removeEventListener('resize', c);
  }, [height]);

  const chartData = useMemo<ChartData<any>>(() => {
    const labels = data.map(p => fmtAxisDate(p.date, granularity));
    const ds: any[] = datasets.map(d => ({
      type: d.type || 'bar',
      label: d.label,
      data: data.map(p => p[d.field] || 0),
      backgroundColor: d.color,
      borderColor: d.color,
      borderWidth: d.type === 'line' ? 2 : 1,
      borderRadius: d.type === 'line' ? 0 : 3,
      maxBarThickness: 26,
      tension: 0.25,
      fill: d.fill || false,
      borderDash: d.dashed ? [4, 4] : [],
      yAxisID: d.yAxisID || 'y',
      pointRadius: d.type === 'line' ? 3 : 0,
      pointBackgroundColor: d.color
    }));
    if (showLineTotal && lineTotalField) {
      ds.unshift({
        type: 'line',
        label: lineTotalLabel,
        data: data.map(p => p[lineTotalField] || 0),
        borderColor: '#B82F2F',
        backgroundColor: '#B82F2F',
        borderWidth: 2.5,
        tension: 0.25,
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: '#B82F2F',
        yAxisID: 'y'
      });
    }
    return { labels, datasets: ds };
  }, [data, datasets, granularity, showLineTotal, lineTotalField, lineTotalLabel]);

  const options = useMemo<ChartOptions<any>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          font: { size: 11, family: 'Inter' },
          boxWidth: 12, boxHeight: 12, padding: 12,
          usePointStyle: false
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${formatValue(ctx.parsed.y, unit, market)}`
        }
      }
    },
    scales: {
      x: {
        stacked,
        ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45, color: '#0F2237' },
        grid: { display: false }
      },
      y: {
        stacked,
        beginAtZero: true,
        ticks: { font: { size: 10 }, color: '#64748b', callback: (v: any) => formatValue(Number(v), unit, market) },
        grid: { color: '#eef2f7' }
      }
    }
  }), [stacked, unit, market]);

  if (!data || data.length === 0) {
    return (
      <div className="daily-chart-card bg-white border border-line rounded-xl p-4 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink2 mb-3">{title}</h3>
        <div className="empty" style={{ height: responsiveHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data in this period</div>
      </div>
    );
  }

  return (
    <div className="daily-chart-card bg-white border border-line rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink2 mb-3">{title}</h3>
      <div style={{ height: responsiveHeight }}>
        <Chart type="bar" data={chartData as any} options={options} />
      </div>
    </div>
  );
}

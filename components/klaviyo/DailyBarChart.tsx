'use client';
import React, { useMemo, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
  type Plugin
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  fmtCurrency, fmtPercent, fmtNumber, fmtMultiple, fmtAxisDate,
  type Granularity
} from '@/lib/klaviyo/utils';
import type { Market } from '@/types/klaviyo/models';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export interface DailyPoint { date: string; value: number; inPeriod?: boolean; }

type Unit = 'currency' | 'number' | 'percent' | 'multiple';

interface Props {
  title: string;
  data: DailyPoint[];
  color: string;       // hex
  unit: Unit;
  market: Market;
  height?: number;
  showLabels?: boolean;
}

function formatValue(v: number, unit: Unit, market: Market): string {
  if (unit === 'currency') return fmtCurrency(v, market, { compact: true });
  if (unit === 'percent') return fmtPercent(v);
  if (unit === 'multiple') return fmtMultiple(v);
  return fmtNumber(v);
}

function inferGranularity(points: DailyPoint[]): Granularity {
  if (points.length < 2) return 'day';
  const a = new Date(points[0].date + 'T00:00:00Z').getTime();
  const b = new Date(points[1].date + 'T00:00:00Z').getTime();
  const diff = Math.abs(b - a) / 86400000;
  if (diff >= 27) return 'month';
  if (diff >= 6) return 'week';
  return 'day';
}

// Plugin custom: labels em cima das barras
const topLabelsPlugin: Plugin<'bar'> = {
  id: 'topLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const ds = chart.data.datasets[0];
    if (!ds) return;
    const meta = chart.getDatasetMeta(0);
    const labels = (chart.options as any)?.plugins?.topLabels?.labels as string[] | undefined;
    const showOnly = (chart.options as any)?.plugins?.topLabels?.showOnly as boolean[] | undefined;
    if (!labels) return;
    ctx.save();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    meta.data.forEach((bar, i) => {
      if (showOnly && !showOnly[i]) return;
      const v = ds.data[i] as number;
      if (v === 0 || v == null) return;
      const x = bar.x;
      const y = bar.y - 4;
      ctx.fillText(labels[i] ?? '', x, y);
    });
    ctx.restore();
  }
};

export default function DailyBarChart({ title, data, color, unit, market, height = 220, showLabels = true }: Props) {
  const granularity = useMemo(() => inferGranularity(data), [data]);
  const hasContextBars = data.some(p => p.inPeriod === false);
  const [responsiveHeight, setResponsiveHeight] = React.useState<number>(height);
  useEffect(() => {
    function compute() {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      if (w < 460) setResponsiveHeight(Math.min(height, 160));
      else if (w < 720) setResponsiveHeight(Math.min(height, 180));
      else setResponsiveHeight(height);
    }
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [height]);

  const chartData: ChartData<'bar'> = useMemo(() => {
    const bg = data.map(p => p.inPeriod === false ? color + '33' : color);
    return {
      labels: data.map(p => fmtAxisDate(p.date, granularity)),
      datasets: [{
        data: data.map(p => p.value),
        backgroundColor: bg,
        borderRadius: 3,
        maxBarThickness: 26
      }]
    };
  }, [data, color, granularity]);

  const xTickColors = useMemo(() => data.map(p => p.inPeriod === false ? '#cbd5e1' : '#0F2237'), [data]);

  const topLabels = useMemo(() => data.map(p => formatValue(p.value, unit, market)), [data, unit, market]);
  const showOnly = useMemo(() => data.map(p => showLabels && (hasContextBars ? p.inPeriod !== false : true)), [data, showLabels, hasContextBars]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 22 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => formatValue(ctx.parsed.y, unit, market)
        }
      },
      // @ts-expect-error custom plugin
      topLabels: { labels: topLabels, showOnly }
    },
    scales: {
      x: {
        ticks: {
          font: { size: 9 },
          maxRotation: 45,
          minRotation: 45,
          color: (ctx) => xTickColors[ctx.index] || '#0F2237'
        },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 10 },
          color: '#64748b',
          callback: (val) => formatValue(Number(val), unit, market)
        },
        grid: { color: '#eef2f7' }
      }
    }
  };

  return (
    <div className="daily-chart-card bg-white border border-line rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink2">{title}</h3>
      </div>
      <div style={{ height: responsiveHeight }}>
        <Bar data={chartData} options={options} plugins={[topLabelsPlugin]} />
      </div>
    </div>
  );
}

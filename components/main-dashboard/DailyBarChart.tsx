'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';
import type { DailyPoint, Market } from '@/lib/main-dashboard/types';
import { fmtAxisDate, fmtCurrency, fmtMultiple, fmtNumber, fmtPercent } from '@/lib/main-dashboard/utils';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);

interface Props {
  title: string;
  data: DailyPoint[];
  color: string;
  unit: 'currency' | 'number' | 'percent' | 'multiple';
  market: Market;
  /** mostrar valores em cima de cada barra (igual ao PDF) */
  showLabels?: boolean;
  height?: number;
}

function fmtValue(v: number, unit: Props['unit'], market: Market, compact = false): string {
  if (v == null || isNaN(v)) return '—';
  switch (unit) {
    case 'currency': return fmtCurrency(v, market, { compact });
    case 'percent': return fmtPercent(v);
    case 'multiple': return fmtMultiple(v);
    default: return fmtNumber(v);
  }
}

export default function DailyBarChart({
  title, data, color, unit, market, showLabels = true, height = 220,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Deduz granularidade pelo intervalo entre os 2 primeiros pontos
    let granularity: 'day' | 'week' | 'month' = 'day';
    if (data.length >= 2) {
      const d1 = new Date(data[0].date);
      const d2 = new Date(data[1].date);
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
      if (diffDays >= 27) granularity = 'month';
      else if (diffDays >= 6) granularity = 'week';
    }
    const labels = data.map((d) => fmtAxisDate(d.date, granularity));
    const values = data.map((d) => Number(d.value));
    // Existe pelo menos 1 barra fora do período? Se sim, ativa esquema de destaque.
    const hasContextBars = data.some((d) => d.inPeriod === false);
    // Cor cheia para inPeriod, cor com opacidade para context bars (fora do período)
    const backgroundColors = data.map((d) =>
      hasContextBars && d.inPeriod === false ? `${color}33` /* ~20% opacity */ : color
    );

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: title,
          data: values,
          backgroundColor: backgroundColors,
          borderRadius: 3,
          borderSkipped: false,
          barThickness: 'flex',
          maxBarThickness: 26,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22, right: 6, left: 0, bottom: 0 } },
        plugins: {
          legend: { display: false }, // título já mostrado acima do gráfico
          tooltip: {
            callbacks: {
              label: (c) => `${title}: ${fmtValue(c.parsed.y, unit, market)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 9 },
              // Labels do período em ink escuro/bold; contexto em cinza claro
              color: (ctx) => {
                const idx = ctx.index;
                const pt = data[idx];
                return hasContextBars && pt?.inPeriod === false ? '#cbd5e1' : '#0F2237';
              },
              maxRotation: 45,
              minRotation: 45,
              autoSkip: false,
            },
          },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: {
              font: { size: 10 },
              color: '#64748b',
              callback: (v) => fmtValue(Number(v), unit, market, true),
            },
            beginAtZero: true,
          },
        },
      },
      plugins: showLabels ? [{
        id: 'topLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          ctx.save();
          ctx.font = '600 9px ui-sans-serif, system-ui';
          ctx.textAlign = 'center';
          meta.data.forEach((bar, idx) => {
            const v = values[idx];
            if (v == null || isNaN(v)) return;
            // Em modo destaque: só mostra label das barras do período
            if (hasContextBars && data[idx]?.inPeriod === false) return;
            ctx.fillStyle = '#0F2237';
            const txt = fmtValue(v, unit, market, true);
            const { x, y } = bar.tooltipPosition(false);
            ctx.fillText(txt, x, y - 4);
          });
          ctx.restore();
        },
      }] : [],
    });

    return () => { chartRef.current?.destroy(); };
  }, [data, color, title, unit, market, showLabels]);

  return (
    <div className="card daily-chart-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
        <span className="text-xs font-semibold uppercase tracking-wide text-steel">{title}</span>
      </div>
      <div style={{ height }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

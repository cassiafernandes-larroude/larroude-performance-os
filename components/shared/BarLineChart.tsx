'use client';

/**
 * Chart de barras compartilhado em TODOS os dashboards nativos.
 * Aplica as mesmas regras do Main Dashboard DailyBarChart:
 *   - chart.js v4, type: 'bar' (com Line opcional sobreposta via ComposedChart-style)
 *   - granularidade automatica (day / week / month) pelo intervalo entre datas
 *   - context bars (inPeriod === false) com 20% opacidade
 *   - topLabels (valor em cima de cada barra, fonte 9px ink #0F2237)
 *   - barThickness flex, max 26px, borderRadius 3
 *   - eixo X sem grid, ticks 9px rot 45deg, labels do periodo bold/ink, context cinza
 *   - eixo Y grid #f1f5f9, ticks 10px #64748b, formatador compact
 *   - tooltip mostra `${title}: valor full`, legend escondida
 *   - card wrapper com quadrado da cor + titulo uppercase tracking-wide
 *
 * Diferenca do DailyBarChart original: suporta linha overlay opcional (lineData)
 * para charts compostos do LTV (AOV+LTV, LTV mensal+RepeatRate, LTV/CAC overtime).
 */

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  LineController,
  BarElement,
  PointElement,
  LineElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  Filler,
} from 'chart.js';

Chart.register(
  BarController, LineController,
  BarElement, PointElement, LineElement,
  CategoryScale, LinearScale, Tooltip, Legend, Title, Filler
);

export type BarUnit = 'currency' | 'number' | 'percent' | 'multiple';
export type Market = 'US' | 'BR';

export interface BarPoint {
  date: string;          // YYYY-MM-DD ou YYYY-MM
  value: number | null;
  inPeriod?: boolean;    // se false → context bar (20% opacity)
  color?: string;        // override da cor padrão (e.g. semáforo verde/amarelo/vermelho)
  labelOverride?: string; // override do topLabel (e.g. formato "3.5x" ao invés de valor)
}

export interface ReferenceLine {
  value: number;
  color: string;
  label?: string;
  dashed?: boolean;
}

export interface LineOverlay {
  data: { date: string; value: number | null }[];
  name: string;
  color: string;
  unit?: BarUnit;        // se não informado, herda do bar
  yAxis?: 'left' | 'right'; // default 'right'
}

interface Props {
  title: string;
  data: BarPoint[];
  color: string;
  unit: BarUnit;
  market: Market;
  /** mostrar valores em cima de cada barra (default true) */
  showLabels?: boolean;
  height?: number;
  /** linha sobreposta opcional (LTV/CAC, AOV+LTV, etc.) */
  line?: LineOverlay;
  /** linhas de referência horizontais (e.g. saudável 3x, breakeven 1x) */
  referenceLines?: ReferenceLine[];
  /** se true, renderiza só o canvas (sem card wrapper) — útil quando o container já tem estética própria */
  bare?: boolean;
}

// ---------- formatters ----------
function currencySymbol(market: Market): string {
  return market === 'US' ? '$' : 'R$';
}
function fmtCurrency(v: number, market: Market, compact = false): string {
  const sym = currencySymbol(market);
  if (compact) {
    if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `${sym}${Math.round(v / 1_000)}K`;
  }
  const locale = market === 'US' ? 'en-US' : 'pt-BR';
  return `${sym}${v.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0,
  })}`;
}
function fmtNumber(v: number, market: Market = 'US'): string {
  const locale = market === 'US' ? 'en-US' : 'pt-BR';
  return v.toLocaleString(locale);
}
function fmtPercent(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}%`;
}
function fmtMultiple(v: number): string {
  return `${v.toFixed(2)}×`;
}
function fmtValue(v: number | null | undefined, unit: BarUnit, market: Market, compact = false): string {
  if (v == null || isNaN(v)) return '—';
  switch (unit) {
    case 'currency': return fmtCurrency(v, market, compact);
    case 'percent': return fmtPercent(v);
    case 'multiple': return fmtMultiple(v);
    default: return fmtNumber(v, market);
  }
}
function fmtAxisDate(iso: string, granularity: 'day' | 'week' | 'month', market: Market): string {
  // YYYY-MM (month) or YYYY-MM-DD
  if (granularity === 'month' || /^\d{4}-\d{2}$/.test(iso)) {
    const [y, m] = iso.split('-');
    const monthNames = market === 'US'
      ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      : ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthIdx = parseInt(m, 10) - 1;
    const yearShort = y.slice(-2);
    return `${monthNames[monthIdx]}/${yearShort}`;
  }
  if (granularity === 'week') {
    const d = new Date(iso + 'T12:00:00');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const monthNum = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${day}/${monthNum}`;
  }
  // day → dd/mm
  const d = new Date(iso + 'T12:00:00');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const monthNum = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${monthNum}`;
}

export default function BarLineChart({
  title,
  data,
  color,
  unit,
  market,
  showLabels = true,
  height = 220,
  line,
  referenceLines,
  bare = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // ---- granularidade automatica ----
    let granularity: 'day' | 'week' | 'month' = 'day';
    if (data.length >= 2) {
      const first = data[0].date;
      // se for YYYY-MM, ja eh mensal
      if (/^\d{4}-\d{2}$/.test(first)) {
        granularity = 'month';
      } else {
        const d1 = new Date(first);
        const d2 = new Date(data[1].date);
        const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
        if (diffDays >= 27) granularity = 'month';
        else if (diffDays >= 6) granularity = 'week';
      }
    }

    const labels = data.map((d) => fmtAxisDate(d.date, granularity, market));
    const values = data.map((d) => (d.value == null ? null : Number(d.value)));
    const hasContextBars = data.some((d) => d.inPeriod === false);
    const backgroundColors = data.map((d) => {
      const baseColor = d.color ?? color;
      if (hasContextBars && d.inPeriod === false) return `${baseColor}33`;
      return baseColor;
    });

    // ---- line overlay (alinha por date) ----
    let lineValues: (number | null)[] | undefined;
    if (line && line.data.length) {
      const lineMap = new Map(line.data.map((p) => [p.date, p.value]));
      lineValues = data.map((d) => {
        const v = lineMap.get(d.date);
        return v == null ? null : Number(v);
      });
    }

    if (chartRef.current) chartRef.current.destroy();

    const datasets: any[] = [
      {
        type: 'bar' as const,
        label: title,
        data: values,
        backgroundColor: backgroundColors,
        borderRadius: 3,
        borderSkipped: false,
        barThickness: 'flex' as const,
        maxBarThickness: 26,
        yAxisID: 'yBar',
        order: 2,
      },
    ];

    if (lineValues) {
      datasets.push({
        type: 'line' as const,
        label: line!.name,
        data: lineValues,
        borderColor: line!.color,
        backgroundColor: line!.color,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: line!.yAxis === 'left' ? 'yBar' : 'yLine',
        order: 1,
      });
    }

    const scales: any = {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 9 },
          color: (cctx: any) => {
            const idx = cctx.index;
            const pt = data[idx];
            return hasContextBars && pt?.inPeriod === false ? '#cbd5e1' : '#0F2237';
          },
          maxRotation: 45,
          minRotation: 45,
          autoSkip: false,
        },
      },
      yBar: {
        position: 'left' as const,
        grid: { color: '#f1f5f9' },
        ticks: {
          font: { size: 10 },
          color: '#64748b',
          callback: (v: number) => fmtValue(Number(v), unit, market, true),
        },
        beginAtZero: true,
      },
    };

    if (lineValues && line && line.yAxis !== 'left') {
      scales.yLine = {
        position: 'right' as const,
        grid: { display: false },
        ticks: {
          font: { size: 10 },
          color: line.color,
          callback: (v: number) => fmtValue(Number(v), line.unit ?? unit, market, true),
        },
        beginAtZero: true,
      };
    }

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22, right: lineValues && line?.yAxis !== 'left' ? 6 : 6, left: 0, bottom: 0 } },
        plugins: {
          legend: lineValues
            ? {
                display: true,
                position: 'top',
                align: 'end',
                labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 }, color: '#64748b' },
              }
            : { display: false },
          tooltip: {
            callbacks: {
              label: (c: any) => {
                const ds = c.dataset;
                const isLine = ds.type === 'line';
                const u = isLine ? (line?.unit ?? unit) : unit;
                const n = isLine ? line!.name : title;
                return `${n}: ${fmtValue(c.parsed.y ?? 0, u, market)}`;
              },
            },
          },
        },
        scales,
      },
      plugins: [
        // referência horizontais (saudável 3x, breakeven 1x, etc.)
        ...(referenceLines && referenceLines.length
          ? [
              {
                id: 'referenceLines',
                afterDraw(chart: any) {
                  const { ctx, chartArea, scales } = chart;
                  const yScale = scales.yBar;
                  if (!yScale || !chartArea) return;
                  ctx.save();
                  referenceLines!.forEach((ref) => {
                    const y = yScale.getPixelForValue(ref.value);
                    if (y < chartArea.top || y > chartArea.bottom) return;
                    ctx.strokeStyle = ref.color;
                    ctx.lineWidth = 1.5;
                    if (ref.dashed !== false) ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, y);
                    ctx.lineTo(chartArea.right, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    if (ref.label) {
                      ctx.fillStyle = ref.color;
                      ctx.font = '9px ui-sans-serif, system-ui';
                      ctx.textAlign = 'right';
                      ctx.fillText(ref.label, chartArea.right - 6, y - 4);
                    }
                  });
                  ctx.restore();
                },
              },
            ]
          : []),
        // valor em cima das barras
        ...(showLabels
          ? [
              {
                id: 'topLabels',
                afterDatasetsDraw(chart: any) {
                  const { ctx } = chart;
                  const meta = chart.getDatasetMeta(0);
                  ctx.save();
                  ctx.font = '600 9px ui-sans-serif, system-ui';
                  ctx.textAlign = 'center';
                  meta.data.forEach((bar: any, idx: number) => {
                    const v = values[idx];
                    if (v == null || isNaN(v as number)) return;
                    if (hasContextBars && data[idx]?.inPeriod === false) return;
                    ctx.fillStyle = '#0F2237';
                    const txt = data[idx]?.labelOverride ?? fmtValue(v as number, unit, market, true);
                    const pos = bar.tooltipPosition(false);
                    const x = (pos as { x: number; y: number }).x ?? 0;
                    const y = (pos as { x: number; y: number }).y ?? 0;
                    ctx.fillText(txt, x, y - 4);
                  });
                  ctx.restore();
                },
              },
            ]
          : []),
      ],
    });

    return () => {
      chartRef.current?.destroy();
    };
  }, [data, color, title, unit, market, showLabels, line, referenceLines]);

  if (bare) {
    return (
      <div style={{ height, width: '100%' }}>
        <canvas ref={canvasRef} />
      </div>
    );
  }

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

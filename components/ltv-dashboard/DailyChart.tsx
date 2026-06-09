'use client';

import BarLineChart from '@/components/shared/BarLineChart';
import type { DailyLtvPoint, Market } from '@/lib/ltv-dashboard/queries';

/**
 * Daily AOV bars + LTV-of-day-customers line — ultimos 28 dias da janela.
 * Refatorado para usar BarLineChart compartilhado (chart.js, mesmas regras
 * do DailyBarChart do Main Dashboard + linha overlay opcional).
 */
export default function DailyChart({
  data,
  market,
}: {
  data: DailyLtvPoint[];
  market: Market;
}) {
  if (!data.length) {
    return <div className="empty">Sem dados no período.</div>;
  }

  const last28 = data.slice(-28);

  const barData = last28.map((d) => ({ date: d.date, value: Number(d.aov) }));
  const lineData = last28.map((d) => ({
    date: d.date,
    value: d.ltvOfDayCustomers != null ? Number(d.ltvOfDayCustomers) : null,
  }));

  return (
    <BarLineChart
      title="AOV diário"
      data={barData}
      color="#2c7a5b"
      unit="currency"
      market={market}
      height={260}
      line={{
        data: lineData,
        name: 'LTV dos compradores',
        color: '#d97757',
        unit: 'currency',
        yAxis: 'right',
      }}
    />
  );
}

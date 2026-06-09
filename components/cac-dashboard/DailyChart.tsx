'use client';

import BarLineChart from '@/components/shared/BarLineChart';
import type { DailyPoint, Market } from '@/lib/cac-dashboard/queries';

/**
 * CAC diário — gráfico de barras unificado (chart.js via BarLineChart).
 *
 * Aplica as regras do Main Dashboard DailyBarChart:
 *   - Granularidade automática (day/week/month) pelo intervalo entre datas
 *   - Context bars (inPeriod === false) com 20% opacity
 *   - topLabels (valor em cima de cada barra)
 *   - barThickness flex, max 26px, borderRadius 3
 *
 * Cor da barra = peach Larroudé (#d97757).
 * Wrapper em `bare` — o `.chart-card` do CAC ja faz o card.
 */
export default function DailyChart({
  data,
  market,
}: {
  data: DailyPoint[];
  market: Market;
}) {
  if (!data.length) {
    return <div className="empty">Sem dados no período.</div>;
  }

  const barData = data.map((d) => ({
    date: d.date,
    value: Number(d.cac),
    inPeriod: (d as any).inPeriod, // se backend passar, ativa context bars automaticamente
  }));

  return (
    <BarLineChart
      title="CAC"
      data={barData}
      color="#d97757"
      unit="currency"
      market={market}
      height={280}
      bare
    />
  );
}

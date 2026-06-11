'use client';

import BarLineChart from '@/components/shared/BarLineChart';
import type { Market, MonthlyLtvPoint } from '@/lib/ltv-dashboard/queries';

/**
 * LTV/CAC overtime em BARRAS — últimos 12 meses.
 *
 *   - Cada barra = ratio LTV/CAC do mês (cap visual em 15x)
 *   - Cor por barra: verde ≥3x · amarelo 1-3x · vermelho <1x
 *   - Reference lines tracejadas em 3x (verde) e 1x (vermelho)
 *   - Label em cima da barra mostra "3.5x" (rawRatio)
 *
 * Refatorado para usar BarLineChart compartilhado (chart.js).
 */
export default function LtvCacOverTimeChart({
  data,
  market,
}: {
  data: MonthlyLtvPoint[];
  market: Market;
}) {
  const VISUAL_CAP = 15;

  function colorFor(ratio: number): string {
    if (ratio <= 0) return '#e7e3da';
    if (ratio >= 3) return '#2c7a5b'; // verde — saudável
    if (ratio >= 1) return '#c0822a'; // amarelo — apertado
    return '#b3382f'; // vermelho — breakeven
  }

  const barData = data.map((d) => {
    const raw = d.ltvCacRatio;
    const clipped = raw > 0 ? Math.min(raw, VISUAL_CAP) : 0;
    return {
      date: d.month,
      value: clipped,
      color: colorFor(raw),
      labelOverride: raw > 0 ? `${raw.toFixed(1)}x` : '',
    };
  });

  const hasData = barData.some((b) => (b.value ?? 0) > 0);

  if (!hasData) {
    return (
      <div className="empty">
        No Meta+Google spend data for this period. LTV/CAC unavailable.
      </div>
    );
  }

  return (
    <BarLineChart
      title="LTV / CAC overtime"
      data={barData}
      color="#2c7a5b"
      unit="multiple"
      market={market}
      height={280}
      referenceLines={[
        { value: 3, color: '#2c7a5b', label: 'Healthy 3x', dashed: true },
        { value: 1, color: '#b3382f', label: 'Breakeven 1x', dashed: true },
      ]}
    />
  );
}

'use client';

import BarLineChart from '@/components/shared/BarLineChart';
import type { Market, MonthlyPoint } from '@/lib/cac-dashboard/queries';

/**
 * CAC mensal — últimos 12 meses.
 * Refatorado para usar BarLineChart compartilhado.
 */
export default function MonthlyChart({
  data,
  market,
}: {
  data: MonthlyPoint[];
  market: Market;
}) {
  if (!data.length) {
    return <div className="empty">Sem dados mensais.</div>;
  }

  const barData = data.map((d) => ({ date: d.month, value: Number(d.cac) }));

  return (
    <BarLineChart
      title="CAC mensal"
      data={barData}
      color="#d44a8a"
      unit="currency"
      market={market}
      height={260}
    />
  );
}

'use client';

import BarLineChart from '@/components/shared/BarLineChart';
import type { Market, MonthlyLtvPoint } from '@/lib/ltv-dashboard/queries';

/**
 * Monthly LTV bars + RepeatRate line — trailing 12 months.
 * Refatorado para usar BarLineChart compartilhado.
 */
export default function MonthlyChart({
  data,
  market,
}: {
  data: MonthlyLtvPoint[];
  market: Market;
}) {
  if (!data.length) {
    return <div className="empty">No monthly data.</div>;
  }

  const barData = data.map((d) => ({ date: d.month, value: Number(d.ltvAvg) }));
  const lineData = data.map((d) => ({
    date: d.month,
    value: d.repeatPurchaseRate != null ? Number(d.repeatPurchaseRate) : null,
  }));

  return (
    <BarLineChart
      title="Monthly Avg LTV"
      data={barData}
      color="#d44a8a"
      unit="currency"
      market={market}
      height={260}
      line={{
        data: lineData,
        name: 'Repeat %',
        color: '#2c7a5b',
        unit: 'percent',
        yAxis: 'right',
      }}
    />
  );
}

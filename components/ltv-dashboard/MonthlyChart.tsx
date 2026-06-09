'use client';

import {
  Bar,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Market, MonthlyLtvPoint } from '@/lib/ltv-dashboard/queries';
import { formatMoney, formatMonth, formatNumber, formatPercent } from '@/lib/ltv-dashboard/format';

/**
 * Monthly LTV bars + RPR line for the trailing 12 months.
 */
export default function MonthlyChart({
  data,
  market,
}: {
  data: MonthlyLtvPoint[];
  market: Market;
}) {
  if (!data.length) {
    return <div className="empty">Sem dados mensais.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 30, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#efece6" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(m) => formatMonth(m, market)}
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={{ stroke: '#e7e3da' }}
          tickLine={false}
        />
        <YAxis
          yAxisId="ltv"
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(v) => (market === 'US' ? `$${v}` : `R$${v}`)}
        />
        <YAxis
          yAxisId="rpr"
          orientation="right"
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 'dataMax + 5']}
        />
        <Tooltip
          cursor={{ fill: 'rgba(212, 74, 138, 0.08)' }}
          contentStyle={{
            background: '#fff',
            border: '1px solid #e7e3da',
            borderRadius: 10,
            fontSize: 12,
            padding: '8px 12px',
          }}
          labelFormatter={(m) => formatMonth(String(m), market)}
          formatter={(value: number, name: string) => {
            if (name === 'LTV médio') return [formatMoney(value, market, true), name];
            if (name === 'Repeat %') return [formatPercent(value), name];
            if (name === 'Clientes') return [formatNumber(value, market), name];
            return [formatMoney(value, market), name];
          }}
        />
        <Bar
          yAxisId="ltv"
          dataKey="ltvAvg"
          name="LTV médio"
          fill="#d44a8a"
          radius={[6, 6, 0, 0]}
          maxBarSize={42}
        />
        <Line
          yAxisId="rpr"
          type="monotone"
          dataKey="repeatPurchaseRate"
          stroke="#2c7a5b"
          strokeWidth={2}
          dot={{ r: 3, fill: '#2c7a5b' }}
          activeDot={{ r: 5 }}
          name="Repeat %"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

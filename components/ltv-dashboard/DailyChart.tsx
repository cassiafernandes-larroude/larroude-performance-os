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
import type { DailyLtvPoint, Market } from '@/lib/ltv-dashboard/queries';
import { formatDate, formatMoney, formatNumber } from '@/lib/ltv-dashboard/format';

/**
 * Daily AOV bars + LTV-of-day-customers line for the last 28 days of the window.
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

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={last28} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#efece6" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => formatDate(d, market)}
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={{ stroke: '#e7e3da' }}
          tickLine={false}
          interval={Math.max(0, Math.floor(last28.length / 8))}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(v) => (market === 'US' ? `$${v}` : `R$${v}`)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(44, 122, 91, 0.08)' }}
          contentStyle={{
            background: '#fff',
            border: '1px solid #e7e3da',
            borderRadius: 10,
            fontSize: 12,
            padding: '8px 12px',
          }}
          labelFormatter={(d) => formatDate(String(d), market)}
          formatter={(value: number, name: string) => {
            if (name === 'AOV') return [formatMoney(value, market, true), name];
            if (name === 'LTV dos compradores') return [formatMoney(value, market, true), name];
            return [formatNumber(value, market), name];
          }}
        />
        <Bar
          dataKey="aov"
          name="AOV"
          fill="#2c7a5b"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Line
          type="monotone"
          dataKey="ltvOfDayCustomers"
          stroke="#d97757"
          strokeWidth={2}
          dot={{ r: 2 }}
          name="LTV dos compradores"
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

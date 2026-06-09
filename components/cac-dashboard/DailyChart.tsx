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
import type { DailyPoint, Market } from '@/lib/cac-dashboard/queries';
import { formatDate, formatMoney, formatNumber } from '@/lib/cac-dashboard/format';

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
          yAxisId="cac"
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(v) => (market === 'US' ? `$${v}` : `R$${v}`)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(217, 119, 87, 0.08)' }}
          contentStyle={{
            background: '#fff',
            border: '1px solid #e7e3da',
            borderRadius: 10,
            fontSize: 12,
            padding: '8px 12px',
          }}
          labelFormatter={(d) => formatDate(String(d), market)}
          formatter={(value: number, name: string) => {
            if (name === 'CAC') return [formatMoney(value, market, true), name];
            if (name === 'Spend') return [formatMoney(value, market), name];
            return [formatNumber(value, market), name];
          }}
        />
        <Bar
          yAxisId="cac"
          dataKey="cac"
          name="CAC"
          fill="#d97757"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="cac"
          type="monotone"
          dataKey="cac"
          stroke="#1a1a1a"
          strokeWidth={1.5}
          dot={false}
          name="Tendência"
          legendType="none"
          activeDot={false}
          strokeDasharray="3 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

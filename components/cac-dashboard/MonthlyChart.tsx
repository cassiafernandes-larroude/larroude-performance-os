'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Market, MonthlyPoint } from '@/lib/cac-dashboard/queries';
import { formatMoney, formatMonth, formatNumber } from '@/lib/cac-dashboard/format';

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

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#efece6" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(m) => formatMonth(m, market)}
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={{ stroke: '#e7e3da' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#8a8a8a' }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(v) => (market === 'US' ? `$${v}` : `R$${v}`)}
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
            if (name === 'CAC') return [formatMoney(value, market, true), name];
            if (name === 'Novos clientes') return [formatNumber(value, market), name];
            return [formatMoney(value, market), name];
          }}
        />
        <Bar dataKey="cac" name="CAC" fill="#d44a8a" radius={[6, 6, 0, 0]} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  );
}

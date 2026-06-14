'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface Item { name: string; value: number; }
interface Props {
  title: string;
  data: Item[];
  height?: number;
  formatValue?: (v: number) => string;
  color?: string;
}

export default function BarRanking({ title, data, height = 220, formatValue, color = '#9333EA' }: Props) {
  // Sort desc for display
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, 10);
  return (
    <div className="card h-full">
      <div className="card-title">{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 6, right: 16, left: 6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={formatValue} axisLine={false} tickLine={false} />
            <YAxis
              type="category" dataKey="name" width={170}
              tick={{ fontSize: 10, fill: '#475569' }}
              tickFormatter={(s: string) => (s.length > 26 ? s.slice(0, 26) + '…' : s)}
              tickLine={false} axisLine={false}
            />
            <Tooltip formatter={(v: any) => (formatValue ? formatValue(Number(v)) : v)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={color} opacity={1 - i * 0.05} />
              ))}
              <LabelList dataKey="value" position="right" className="print-bar-label" formatter={(v: any) => (formatValue ? formatValue(Number(v)) : String(v))} fontSize={9} fill="#1A1A1A" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

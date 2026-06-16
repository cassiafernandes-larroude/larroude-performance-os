'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LabelList } from 'recharts';
import { formatCurrency } from '@/lib/meta-ads-native/format';

interface Props {
  data: { objective: string; spend: number }[];
  currency?: string;
}

export default function ObjectiveSpend({ data, currency = 'USD' }: Props) {
  return (
    <div className="card h-full">
      <div className="card-title">Campaign Objective Spent</div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => formatCurrency(v, currency, true)} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="objective" width={170} tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: any) => formatCurrency(Number(v), currency, true)} />
            <Bar dataKey="spend" fill="#D44A8A" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="spend" position="right" className="print-bar-label" formatter={(v: any) => formatCurrency(Number(v), currency, true)} fontSize={9} fill="#1A1A1A" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

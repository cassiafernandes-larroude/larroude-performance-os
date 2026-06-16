'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { formatCurrency } from '@/lib/meta-ads-native/format';

interface Props {
  data: { age: string; female: number; male: number }[];
  currency?: string;
}

export default function AgeGroupBar({ data, currency = 'USD' }: Props) {
  return (
    <div className="card h-full">
      <div className="card-title">Age groups by spend</div>
      <div className="h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="age" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => formatCurrency(v, currency, true)} width={56} />
            <Tooltip formatter={(v: any, name: string) => [formatCurrency(Number(v), currency, true), name]} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="female" name="female" fill="#D44A8A" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="female" position="top" className="print-bar-label" formatter={(v: any) => formatCurrency(Number(v), currency, true)} fontSize={8} fill="#1A1A1A" />
            </Bar>
            <Bar dataKey="male"   name="male"   fill="#F4B2CD" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="male" position="top" className="print-bar-label" formatter={(v: any) => formatCurrency(Number(v), currency, true)} fontSize={8} fill="#1A1A1A" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

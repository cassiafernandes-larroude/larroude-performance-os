'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, Cell, LabelList } from 'recharts';
import { formatDate, formatNumber } from '@/lib/meta-ads-native/format';

interface Props { data: { date: string; reach: number; frequency: number; isHighlighted?: boolean }[]; }

export default function ReachFrequency({ data }: Props) {
  const hasHighlight = data.some((d) => d.isHighlighted === false);
  return (
    <div className="card h-full">
      <div className="card-title">Reach &amp; Frequency</div>
      <div className="h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F1EA" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 10, fill: '#64748B' }} minTickGap={20} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => formatNumber(v, true)} width={48} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748B' }} width={32} />
            <Tooltip labelFormatter={(d) => formatDate(d, 'long')} cursor={{ fill: 'rgba(238,63,140,0.06)' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="reach" name="Reach" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={`reach-${i}`} fill={hasHighlight && d.isHighlighted === false ? '#FDD0E0' : '#D44A8A'} />
              ))}
              <LabelList dataKey="reach" position="top" className="print-bar-label" formatter={(v: any) => formatNumber(Number(v), true)} fontSize={9} fill="#1A1A1A" />
            </Bar>
            <Bar yAxisId="right" dataKey="frequency" name="Frequency" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={`freq-${i}`} fill={hasHighlight && d.isHighlighted === false ? '#E5BBC9' : '#922D5C'} />
              ))}
              <LabelList dataKey="frequency" position="top" className="print-bar-label" formatter={(v: any) => Number(v).toFixed(2)} fontSize={9} fill="#1A1A1A" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasHighlight && (
        <div className="flex items-center gap-3 mt-2 text-[11px] text-ink-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" />Selected period</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-200" />Context</span>
        </div>
      )}
    </div>
  );
}

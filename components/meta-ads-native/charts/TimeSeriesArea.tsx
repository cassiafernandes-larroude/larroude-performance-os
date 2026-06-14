'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import type { TimeSeriesPoint } from '@/lib/meta-ads-native/types';
import { formatDate } from '@/lib/meta-ads-native/format';

interface Props {
  title: string;
  data: TimeSeriesPoint[];
  height?: number;
  valueLabel?: string;
  yFormat?: (v: number) => string;
  /** kept for backwards compat — comparison rendering removed per user request */
  showComparison?: boolean;
  comparisonLabel?: string;
  /** decoration (line/area mantidas como alias para bar) */
  type?: 'area' | 'line' | 'bar';
}

export default function TimeSeriesArea({
  title, data, height = 230, valueLabel = 'Value', yFormat,
}: Props) {
  const hasHighlight = data.some((d) => d.isHighlighted === false);
  return (
    <div className="card h-full">
      <div className="card-title">{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F1EA" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatDate(d, 'short')}
              tick={{ fontSize: 10, fill: '#64748B' }}
              tickLine={false}
              axisLine={{ stroke: '#E7E5DE' }}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#64748B' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={yFormat ?? ((v) => String(v))}
              width={48}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E7E5DE' }}
              labelFormatter={(d) => formatDate(d, 'long')}
              formatter={(v: any) => (yFormat ? yFormat(Number(v)) : v)}
              cursor={{ fill: 'rgba(238,63,140,0.06)' }}
            />
            <Bar dataKey="value" name={valueLabel} radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={hasHighlight && d.isHighlighted === false ? '#FDD0E0' : '#D44A8A'}
                />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                className="print-bar-label"
                formatter={(v: any) => (yFormat ? yFormat(Number(v)) : String(v))}
                fontSize={9}
                fill="#1A1A1A"
              />
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

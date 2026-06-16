'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LabelList } from 'recharts';

export default function MonthlyRoas({ data }: { data: { month: string; roas: number }[] }) {
  const fmtMonth = (m: string) => {
    if (!m) return '';
    const [y, mo] = m.split('-');
    const dt = new Date(Number(y), Number(mo) - 1, 1);
    return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };
  return (
    <div className="card h-full">
      <div className="card-title">ROAS · Monthly</div>
      <div className="h-[210px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F1EA" vertical={false} />
            <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: '#64748B' }} />
            <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => v.toFixed(1)} width={32} />
            <Tooltip formatter={(v: any) => Number(v).toFixed(2)} labelFormatter={fmtMonth} cursor={{ fill: 'rgba(238,63,140,0.06)' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="roas" fill="#EE3F8C" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="roas" position="top" formatter={(v: any) => Number(v).toFixed(1)} fontSize={10} fill="#7E1B45" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS: Record<string, string> = {
  female: '#EE3F8C',   // brand-500
  male:   '#F771A8',   // brand-400
  unknown: '#FDD0E0',  // brand-200
};

export default function GenderDonut({ data }: { data: { gender: string; value: number }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="card h-full">
      <div className="card-title">PURCHASES BY GENDER</div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="gender" innerRadius={45} outerRadius={75} paddingAngle={2}>
              {data.map((d, i) => (
                <Cell key={i} fill={COLORS[d.gender] || '#D8B4FE'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: any, _n, p: any) => {
                const pct = total ? ((v / total) * 100).toFixed(1) : '0';
                return [`${v} (${pct}%)`, p.payload.gender];
              }}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

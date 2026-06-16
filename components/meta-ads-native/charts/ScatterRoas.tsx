'use client';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import type { ScatterPoint } from '@/lib/meta-ads-native/types';
import { formatCurrency } from '@/lib/meta-ads-native/format';

export default function ScatterRoas({ data, currency = 'USD' }: { data: ScatterPoint[]; currency?: string }) {
  // 1 point per ad (spend x ROAS)
  const points = data.filter((d) => d.spend > 0);

  return (
    <div className="card">
      <div className="card-title">Amount Spent × ROAS · Last 28 Days (1 point = 1 ad)</div>
      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F1EA" />
            <XAxis
              type="number"
              dataKey="spend"
              name="Amount spent"
              scale="log"
              domain={['auto', 'auto']}
              tickFormatter={(v) => formatCurrency(v, currency, true)}
              tick={{ fontSize: 10, fill: '#64748B' }}
              tickLine={false}
              axisLine={{ stroke: '#E7E5DE' }}
              label={{ value: 'Amount spent', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#64748B' }}
            />
            <YAxis
              type="number"
              dataKey="roas"
              name="ROAS"
              tickFormatter={(v) => v.toFixed(1)}
              tick={{ fontSize: 10, fill: '#64748B' }}
              tickLine={false}
              axisLine={{ stroke: '#E7E5DE' }}
              label={{ value: 'ROAS', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748B' }}
            />
            <ZAxis range={[60, 240]} />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E7E5DE' }}
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as ScatterPoint;
                if (!p) return null;
                return (
                  <div className="bg-white border border-stone-200 rounded-lg p-2 shadow-sm">
                    <div className="text-xs font-semibold text-ink-800 max-w-[260px]">{p.name}</div>
                    <div className="text-[11px] text-ink-600 mt-1">Spend: <span className="font-medium">{formatCurrency(p.spend, currency, true)}</span></div>
                    <div className="text-[11px] text-ink-600">ROAS: <span className="font-medium">{p.roas.toFixed(2)}</span></div>
                  </div>
                );
              }}
            />
            <Scatter data={points} fillOpacity={0.7}>
              {points.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.roas >= 3 ? '#EE3F8C' : d.roas >= 2 ? '#F771A8' : d.roas >= 1 ? '#FBA7C5' : '#FDD0E0'}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 mt-3 text-[11px] text-ink-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-500" />ROAS ≥ 3</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-400" />ROAS 2–3</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-300" />ROAS 1–2</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-200" />ROAS &lt; 1</span>
      </div>
    </div>
  );
}

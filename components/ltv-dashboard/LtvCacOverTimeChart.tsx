'use client';

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import type { Market, MonthlyLtvPoint } from '@/lib/ltv-dashboard/queries';
import { formatMoney, formatMonth } from '@/lib/ltv-dashboard/format';

/**
 * Gráfico LTV/CAC overtime (12 meses) em BARRAS.
 *
 *   - Cada barra = ratio LTV/CAC do mês (com visual cap em 15x)
 *   - Cor: 🟢 ≥3x saudável · 🟡 1-3x apertado · 🔴 <1x breakeven
 *   - Linhas de referência tracejadas em 3x (verde) e 1x (vermelho)
 *   - Tooltip mostra LTV, CAC e ratio REAL (não clipado) do mês
 */
export default function LtvCacOverTimeChart({
  data,
  market,
}: {
  data: MonthlyLtvPoint[];
  market: Market;
}) {
  const VISUAL_CAP = 15;
  const series = data.map((d) => ({
    month: d.month,
    ratio: d.ltvCacRatio > 0 ? Math.min(d.ltvCacRatio, VISUAL_CAP) : 0,
    rawRatio: d.ltvCacRatio,
    ltv: d.ltvAvg,
    cac: d.cac,
  }));

  const ratios = series.map((s) => s.ratio).filter((r) => r > 0);
  const maxRatio = ratios.length > 0 ? Math.min(VISUAL_CAP, Math.max(...ratios, 4)) : 4;

  if (!ratios.length) {
    return (
      <div className="empty">
        Sem dados de spend Meta+Google para o período. LTV/CAC indisponível.
      </div>
    );
  }

  function colorFor(ratio: number): string {
    if (ratio === 0) return '#e7e3da';
    if (ratio >= 3) return '#2c7a5b';   // verde — saudável
    if (ratio >= 1) return '#c0822a';   // amarelo — apertado
    return '#b3382f';                    // vermelho — breakeven
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={series} margin={{ top: 28, right: 16, bottom: 8, left: 0 }}>
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
          width={42}
          domain={[0, Math.ceil(maxRatio + 1)]}
          tickFormatter={(v) => `${v}x`}
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
          labelFormatter={(m) => formatMonth(String(m), market)}
          formatter={(value: number, name: string, item: { payload?: { rawRatio?: number; ltv?: number; cac?: number } }) => {
            if (name === 'LTV / CAC') {
              const raw = item?.payload?.rawRatio ?? value;
              return [raw > 0 ? `${raw.toFixed(2)}x` : '—', 'LTV / CAC'];
            }
            return [value, name];
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={(props: any) => {
            if (!props.active || !props.payload?.length) return null;
            const p = props.payload[0].payload;
            return (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e7e3da',
                  borderRadius: 10,
                  fontSize: 12,
                  padding: '10px 14px',
                  lineHeight: 1.6,
                  minWidth: 180,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {formatMonth(p.month, market)}
                </div>
                <div style={{ color: colorFor(p.rawRatio), fontWeight: 700, fontSize: 14 }}>
                  LTV / CAC: {p.rawRatio > 0 ? `${p.rawRatio.toFixed(2)}x` : '—'}
                </div>
                <div style={{ color: '#8a8a8a', fontSize: 11, marginTop: 4 }}>
                  LTV: {formatMoney(p.ltv, market, true)}
                  <br />
                  CAC: {formatMoney(p.cac, market, true)}
                </div>
              </div>
            );
          }}
        />
        <ReferenceLine
          y={1}
          stroke="#b3382f"
          strokeDasharray="3 3"
          strokeWidth={1}
          label={{
            value: 'Breakeven 1x',
            fill: '#b3382f',
            fontSize: 9,
            position: 'insideTopRight',
          }}
        />
        <ReferenceLine
          y={3}
          stroke="#2c7a5b"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: 'Saudável 3x',
            fill: '#2c7a5b',
            fontSize: 9,
            position: 'insideTopRight',
          }}
        />
        <Bar dataKey="ratio" name="LTV / CAC" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {series.map((entry, idx) => (
            <Cell key={idx} fill={colorFor(entry.rawRatio)} />
          ))}
          <LabelList
            dataKey="rawRatio"
            position="top"
            fontSize={10}
            fill="#4a4a4a"
            formatter={(v: number) => (v > 0 ? `${v.toFixed(1)}x` : '')}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

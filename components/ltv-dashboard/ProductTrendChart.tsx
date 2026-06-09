'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Market, ProductLtv, ProductDailyPoint } from '@/lib/ltv-dashboard/queries';
import { topLtvMinCustomers } from '@/lib/ltv-dashboard/thresholds';
import { formatDate, formatMoney, formatNumber } from '@/lib/ltv-dashboard/format';

type Metric = 'customerLtvAvg' | 'customers' | 'revenue' | 'units';
const METRIC_LABELS: Record<Metric, string> = {
  customerLtvAvg: 'LTV médio',
  customers: 'Clientes',
  revenue: 'Receita',
  units: 'Unidades',
};

export default function ProductTrendChart({
  productDaily,
  products,
  market,
  startDate,
  endDate,
}: {
  productDaily: ProductDailyPoint[];
  products: ProductLtv[];
  market: Market;
  startDate: string;
  endDate: string;
}) {
  // Build union A ∪ B SKU list
  const unionMeta = useMemo(() => {
    const days = Math.max(
      1,
      Math.round(
        (new Date(endDate + 'T00:00:00Z').getTime() -
          new Date(startDate + 'T00:00:00Z').getTime()) /
          86_400_000
      ) + 1
    );
    const minCustomers = topLtvMinCustomers(days);
    const byUnits = [...products].sort((a, b) => b.units - a.units);
    const topVol = byUnits.slice(0, 15);
    const topLtv = [...products]
      .filter((p) => p.customers >= minCustomers && p.customerLtvAvg > 0)
      .sort((a, b) => b.customerLtvAvg - a.customerLtvAvg)
      .slice(0, 15);
    const inA = new Set(topVol.map((p) => p.motherSku));
    const inB = new Set(topLtv.map((p) => p.motherSku));
    const order: Array<{ sku: string; label: string; tag: string }> = [];
    for (const p of topVol) {
      const tag = inB.has(p.motherSku) ? '[A·B]' : '[A]';
      order.push({ sku: p.motherSku, label: `${tag} ${p.productName || p.motherSku}`, tag });
    }
    for (const p of topLtv) {
      if (inA.has(p.motherSku)) continue;
      order.push({ sku: p.motherSku, label: `[B] ${p.productName || p.motherSku}`, tag: '[B]' });
    }
    return order;
  }, [products, startDate, endDate]);

  const [selected, setSelected] = useState<string>(() => unionMeta[0]?.sku || '');
  const [metric, setMetric] = useState<Metric>('customerLtvAvg');

  // Build full date range so the chart shows zero days
  const chartData = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    const allDates: string[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
    const byDate = new Map<string, ProductDailyPoint>();
    productDaily
      .filter((p) => p.motherSku === selected)
      .forEach((p) => byDate.set(p.date, p));
    return allDates.map((date) => {
      const p = byDate.get(date);
      return {
        date,
        customerLtvAvg: p?.customerLtvAvg ?? 0,
        customers: p?.customers ?? 0,
        revenue: p?.revenue ?? 0,
        units: p?.units ?? 0,
      };
    });
  }, [productDaily, selected, startDate, endDate]);

  const selectedLabel = unionMeta.find((u) => u.sku === selected)?.label || selected;

  const fmtY = (v: number) => {
    if (metric === 'customerLtvAvg' || metric === 'revenue') {
      return market === 'US' ? `$${v}` : `R$${v}`;
    }
    return String(v);
  };

  if (!unionMeta.length) {
    return <div className="empty">Sem produtos disponíveis para análise.</div>;
  }

  return (
    <div className="card-section">
      <div className="section-head">
        <h3>Tendência Diária · LTV por Produto</h3>
        <span className="section-meta">Selecione um produto da união A∪B</span>
      </div>
      <div className="trend-controls">
        <label>
          <span>Produto:</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {unionMeta.map((m) => (
              <option key={m.sku} value={m.sku}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Métrica:</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#efece6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatDate(d, market)}
              tick={{ fontSize: 10, fill: '#8a8a8a' }}
              axisLine={{ stroke: '#e7e3da' }}
              tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 12))}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#8a8a8a' }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={fmtY}
            />
            <Tooltip
              contentStyle={{
                background: '#fff',
                border: '1px solid #e7e3da',
                borderRadius: 10,
                fontSize: 12,
                padding: '8px 12px',
              }}
              labelFormatter={(d) => formatDate(String(d), market)}
              formatter={(value: number) => {
                if (metric === 'customerLtvAvg' || metric === 'revenue') {
                  return [
                    formatMoney(value, market, metric === 'customerLtvAvg'),
                    METRIC_LABELS[metric],
                  ];
                }
                return [formatNumber(value, market), METRIC_LABELS[metric]];
              }}
            />
            <Line
              type="monotone"
              dataKey={metric}
              stroke="#2c7a5b"
              strokeWidth={2}
              dot={{ r: 3, fill: '#2c7a5b' }}
              activeDot={{ r: 5 }}
              name={selectedLabel}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

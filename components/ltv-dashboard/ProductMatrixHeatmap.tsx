'use client';

import { useMemo } from 'react';
import type { Market, ProductLtv, ProductDailyPoint } from '@/lib/ltv-dashboard/queries';
import { topLtvMinCustomers } from '@/lib/ltv-dashboard/thresholds';
import { formatMoney } from '@/lib/ltv-dashboard/format';

/**
 * Heatmap of LTV × day for the union A ∪ B.
 *
 *   Green   = high LTV (good — opposite of CAC dashboard!)
 *   Red     = low LTV (bad)
 *   Gray    = no buyer that day
 *
 * The color scale uses percentile-based clamping (P20/P80) to be robust
 * against outliers.
 */
export default function ProductMatrixHeatmap({
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
  const { rowsA, rowsB, dates, allValues } = useMemo(() => {
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
    const topA = byUnits.slice(0, 15);
    const topB = [...products]
      .filter((p) => p.customers >= minCustomers && p.customerLtvAvg > 0)
      .sort((a, b) => b.customerLtvAvg - a.customerLtvAvg)
      .slice(0, 15);
    const inA = new Set(topA.map((p) => p.motherSku));
    const onlyB = topB.filter((p) => !inA.has(p.motherSku));

    const datesArr: string[] = [];
    for (
      let d = new Date(startDate + 'T00:00:00Z');
      d <= new Date(endDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      datesArr.push(d.toISOString().slice(0, 10));
    }

    // For color scale, collect all positive LTV values
    const all: number[] = [];
    productDaily.forEach((p) => {
      if (p.customers > 0 && p.customerLtvAvg > 0) all.push(p.customerLtvAvg);
    });

    return { rowsA: topA, rowsB: onlyB, dates: datesArr, allValues: all };
  }, [products, productDaily, startDate, endDate]);

  // Color scale: percentile-based (P20/P80), but with HIGH LTV = green
  const { lowQ, highQ } = useMemo(() => {
    if (!allValues.length) return { lowQ: 0, highQ: 1 };
    const sorted = [...allValues].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return { lowQ: q(0.2), highQ: q(0.8) };
  }, [allValues]);

  const valueByCell = useMemo(() => {
    const m = new Map<string, ProductDailyPoint>();
    productDaily.forEach((p) => m.set(`${p.motherSku}|${p.date}`, p));
    return m;
  }, [productDaily]);

  // INVERTED scale relative to CAC: high LTV = green, low LTV = red
  function colorFor(ltv: number, hasCustomer: boolean): string {
    if (!hasCustomer) return '#e7e3da';
    if (ltv >= highQ) return '#16a34a'; // strong green for HIGH LTV
    if (ltv <= lowQ) return '#b3382f'; // red for LOW LTV
    // interpolate red → yellow → green
    const t = (ltv - lowQ) / Math.max(1, highQ - lowQ); // 0..1
    if (t < 0.5) {
      // red → yellow
      const r = Math.round(179 + (217 - 179) * (t * 2));
      const g = Math.round(56 + (180 - 56) * (t * 2));
      const b = Math.round(47 + (50 - 47) * (t * 2));
      return `rgb(${r},${g},${b})`;
    }
    // yellow → green
    const t2 = (t - 0.5) * 2;
    const r = Math.round(217 + (22 - 217) * t2);
    const g = Math.round(180 + (163 - 180) * t2);
    const b = Math.round(50 + (74 - 50) * t2);
    return `rgb(${r},${g},${b})`;
  }

  function fmtCell(ltv: number, hasCustomer: boolean): string {
    if (!hasCustomer) return '·';
    if (ltv >= 1000) return Math.round(ltv / 1000) + 'k';
    if (ltv >= 100) return Math.round(ltv).toString();
    return ltv.toFixed(0);
  }

  function dayLabel(iso: string): string {
    const d = new Date(iso + 'T12:00:00Z');
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function renderRow(p: ProductLtv) {
    return (
      <tr key={p.motherSku}>
        <td className="hm-name" title={p.productName || p.motherSku}>
          {p.productName || p.motherSku}
        </td>
        {dates.map((date) => {
          const cell = valueByCell.get(`${p.motherSku}|${date}`);
          const hasCust = !!cell && cell.customers > 0;
          const ltv = cell?.customerLtvAvg ?? 0;
          const tooltip = hasCust
            ? `${p.productName || p.motherSku}\n${date}\nLTV ${formatMoney(ltv, market)}\n${cell?.customers || 0} clientes`
            : `${date}\nsem compradores`;
          return (
            <td
              key={date}
              className="hm-cell"
              style={{ background: colorFor(ltv, hasCust), color: hasCust ? '#fff' : '#8a8a8a' }}
              title={tooltip}
            >
              {fmtCell(ltv, hasCust)}
            </td>
          );
        })}
      </tr>
    );
  }

  if (!productDaily.length) {
    return <div className="empty">Sem dados diários no período.</div>;
  }

  return (
    <div className="card-section">
      <div className="section-head">
        <h3>Matriz Diária · LTV por Produto × Dia</h3>
        <span className="section-meta">
          Verde = LTV alto · Vermelho = LTV baixo · Cinza = sem comprador
        </span>
      </div>
      <div className="hm-scroll">
        <table className="hm-table">
          <thead>
            <tr>
              <th className="hm-col-name">Produto</th>
              {dates.map((d) => (
                <th key={d} className="hm-col-day">
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="hm-section-row">
              <td colSpan={dates.length + 1}>A · TOP 15 POR VOLUME</td>
            </tr>
            {rowsA.map(renderRow)}
            {rowsB.length > 0 && (
              <tr className="hm-section-row">
                <td colSpan={dates.length + 1}>B · MAIOR LTV (NÃO EM A)</td>
              </tr>
            )}
            {rowsB.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

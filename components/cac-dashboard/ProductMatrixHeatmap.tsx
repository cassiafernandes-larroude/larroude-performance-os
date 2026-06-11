'use client';

import { useMemo } from 'react';
import type { Market, ProductCac, ProductDailyPoint } from '@/lib/cac-dashboard/queries';
import { formatMoney } from '@/lib/cac-dashboard/format';

/**
 * Heatmap of CAC × day for the union A ∪ B.
 *   Green   = low CAC (good)
 *   Red     = high CAC (bad)
 *   Gray    = no new customer that day
 */
export default function ProductMatrixHeatmap({
  productDaily, products, market, startDate, endDate,
}: {
  productDaily: ProductDailyPoint[];
  products: ProductCac[];
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
    const minNew = days <= 28 ? 20 : days <= 60 ? 43 : 64;
    const byUnits = [...products].sort((a, b) => b.units - a.units);
    const topA = byUnits.slice(0, 15);
    const topB = [...products]
      .filter((p) => p.newCustomers >= minNew && p.cac > 0)
      .sort((a, b) => a.cac - b.cac)
      .slice(0, 15);
    const inA = new Set(topA.map((p) => p.motherSku));
    const onlyB = topB.filter((p) => !inA.has(p.motherSku));

    // Date range
    const datesArr: string[] = [];
    for (
      let d = new Date(startDate + 'T00:00:00Z');
      d <= new Date(endDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      datesArr.push(d.toISOString().slice(0, 10));
    }

    // For color scale, collect all positive CAC values
    const all: number[] = [];
    productDaily.forEach((p) => {
      if (p.newCustomers > 0 && p.cac > 0) all.push(p.cac);
    });

    return { rowsA: topA, rowsB: onlyB, dates: datesArr, allValues: all };
  }, [products, productDaily, startDate, endDate]);

  // Color scale: percentile-based to be robust against outliers
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

  function colorFor(cac: number, hasNewCustomer: boolean): string {
    if (!hasNewCustomer) return '#e7e3da'; // gray
    if (cac <= lowQ) return '#16a34a'; // strong green
    if (cac >= highQ) return '#b3382f'; // red
    // interpolate green → yellow → red
    const t = (cac - lowQ) / Math.max(1, highQ - lowQ); // 0..1
    if (t < 0.5) {
      // green → yellow
      const r = Math.round(22 + (217 - 22) * (t * 2));
      const g = Math.round(163 + (180 - 163) * (t * 2));
      const b = Math.round(74 + (50 - 74) * (t * 2));
      return `rgb(${r},${g},${b})`;
    }
    // yellow → red
    const t2 = (t - 0.5) * 2;
    const r = Math.round(217 + (179 - 217) * t2);
    const g = Math.round(180 + (56 - 180) * t2);
    const b = Math.round(50 + (47 - 50) * t2);
    return `rgb(${r},${g},${b})`;
  }

  function fmtCell(cac: number, hasNewCustomer: boolean): string {
    if (!hasNewCustomer) return '·';
    if (cac >= 1000) return Math.round(cac / 1000) + 'k';
    if (cac >= 100) return Math.round(cac).toString();
    return cac.toFixed(0);
  }

  function dayLabel(iso: string): string {
    const d = new Date(iso + 'T12:00:00Z');
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function renderRow(p: ProductCac) {
    return (
      <tr key={p.motherSku}>
        <td className="hm-name" title={p.productName || p.motherSku}>
          {p.productName || p.motherSku}
        </td>
        {dates.map((date) => {
          const cell = valueByCell.get(`${p.motherSku}|${date}`);
          const hasNew = !!cell && cell.newCustomers > 0;
          const cac = cell?.cac ?? 0;
          const tooltip = hasNew
            ? `${p.productName || p.motherSku}\n${date}\nCAC ${formatMoney(cac, market)}\n${cell?.newCustomers || 0} novos`
            : `${date}\nsem novo cliente`;
          return (
            <td
              key={date}
              className="hm-cell"
              style={{ background: colorFor(cac, hasNew), color: hasNew ? '#fff' : '#8a8a8a' }}
              title={tooltip}
            >
              {fmtCell(cac, hasNew)}
            </td>
          );
        })}
      </tr>
    );
  }

  if (!productDaily.length) {
    return <div className="empty">No daily data in this period.</div>;
  }

  return (
    <div className="card-section">
      <div className="section-head">
        <h3>Daily Matrix · CAC by Product × Day</h3>
        <span className="section-meta">
          Green = low CAC · Red = high CAC · Gray = no new customer
        </span>
      </div>
      <div className="hm-scroll">
        <table className="hm-table">
          <thead>
            <tr>
              <th className="hm-col-name">Product</th>
              {dates.map((d) => (
                <th key={d} className="hm-col-day">{dayLabel(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="hm-section-row">
              <td colSpan={dates.length + 1}>A · TOP 15 BY VOLUME</td>
            </tr>
            {rowsA.map(renderRow)}
            {rowsB.length > 0 && (
              <tr className="hm-section-row">
                <td colSpan={dates.length + 1}>B · LOWEST CAC (NOT IN A)</td>
              </tr>
            )}
            {rowsB.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

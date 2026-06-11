'use client';

import { useMemo, useState } from 'react';
import type { Market, CategoryLtv } from '@/lib/ltv-dashboard/queries';
import { formatMoney, formatNumber } from '@/lib/ltv-dashboard/format';

type SortKey = 'units' | 'customerLtvAvg' | 'customers' | 'revenue' | 'customerLtvMedian';

function sortBy<T>(arr: T[], key: keyof T, desc = true): T[] {
  return [...arr].sort((a, b) => {
    const av = (a[key] as unknown as number) ?? 0;
    const bv = (b[key] as unknown as number) ?? 0;
    return desc ? bv - av : av - bv;
  });
}

export default function CategoryLtvTable({
  categories,
  market,
}: {
  categories: CategoryLtv[];
  market: Market;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('units');
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(
    () => sortBy(categories, sortKey as keyof CategoryLtv, desc).slice(0, 5),
    [categories, sortKey, desc]
  );

  const toggle = (k: SortKey) => {
    if (sortKey === k) setDesc(!desc);
    else {
      setSortKey(k);
      setDesc(true);
    }
  };
  const arrow = (k: SortKey) => (sortKey === k ? (desc ? ' ▼' : ' ▲') : '');
  const maxUnits = Math.max(...categories.map((r) => r.units), 1);
  const maxLtv = Math.max(...categories.map((r) => r.customerLtvAvg), 1);

  if (!categories.length) {
    return <div className="empty">No categories in this period.</div>;
  }

  return (
    <div className="card-section">
      <div className="section-head">
        <span
          className="section-badge"
          style={{ background: '#5d4ec5', color: '#fff' }}
        >
          B · CATEGORY
        </span>
        <h3>Top 5 · LTV by Category</h3>
        <span className="section-meta">
          Sandal · Mule · Boot · Flat · Pump · Loafer · Slingback · Sneaker
        </span>
      </div>
      <div className="table-scroll">
        <table className="prod-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Category</th>
              <th className="num" onClick={() => toggle('units')}>
                Units{arrow('units')}
              </th>
              <th className="num" onClick={() => toggle('revenue')}>
                Revenue{arrow('revenue')}
              </th>
              <th className="num" onClick={() => toggle('customers')}>
                Customers{arrow('customers')}
              </th>
              <th className="num" onClick={() => toggle('customerLtvAvg')}>
                Avg LTV{arrow('customerLtvAvg')}
              </th>
              <th className="num" onClick={() => toggle('customerLtvMedian')}>
                Median LTV{arrow('customerLtvMedian')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={c.categoryCode}>
                <td className="rank-cell">{i + 1}</td>
                <td className="name-cell">
                  <div className="prod-name">{c.categoryName}</div>
                </td>
                <td className="num">
                  <div className="bar-cell">
                    <div className="mini-bar">
                      <div
                        className="mini-bar-fill"
                        style={{
                          width: `${(c.units / maxUnits) * 100}%`,
                          background: '#5d4ec5',
                        }}
                      />
                    </div>
                    <span>{formatNumber(c.units, market)}</span>
                  </div>
                </td>
                <td className="num">{formatMoney(c.revenue, market)}</td>
                <td className="num">{formatNumber(c.customers, market)}</td>
                <td className="num ltv-cell">
                  <div className="bar-cell">
                    <div className="mini-bar">
                      <div
                        className="mini-bar-fill"
                        style={{
                          width: `${(c.customerLtvAvg / maxLtv) * 100}%`,
                          background: '#2c7a5b',
                        }}
                      />
                    </div>
                    <span>
                      {c.customerLtvAvg > 0 ? formatMoney(c.customerLtvAvg, market) : '—'}
                    </span>
                  </div>
                </td>
                <td className="num">
                  {c.customerLtvMedian > 0 ? formatMoney(c.customerLtvMedian, market) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

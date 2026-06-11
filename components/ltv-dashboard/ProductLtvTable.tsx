'use client';

import { useMemo, useState } from 'react';
import type { Market, ProductLtv } from '@/lib/ltv-dashboard/queries';
import { topLtvMinCustomers } from '@/lib/ltv-dashboard/thresholds';
import { formatMoney, formatNumber } from '@/lib/ltv-dashboard/format';

type SortKey = 'units' | 'customerLtvAvg' | 'customers' | 'revenue' | 'customerLtvMedian';

function sortBy<T>(arr: T[], key: keyof T, desc = true): T[] {
  return [...arr].sort((a, b) => {
    const av = (a[key] as unknown as number) ?? 0;
    const bv = (b[key] as unknown as number) ?? 0;
    return desc ? bv - av : av - bv;
  });
}

interface SectionProps {
  title: string;
  badge: string;
  badgeColor: string;
  rows: ProductLtv[];
  highlightField: SortKey;
  market: Market;
  highlightSku?: string | null;
  onSelect?: (sku: string) => void;
}

function ProductSection({
  title,
  badge,
  badgeColor,
  rows,
  highlightField,
  market,
  highlightSku,
  onSelect,
}: SectionProps) {
  const [sortKey, setSortKey] = useState<SortKey>(highlightField);
  const [desc, setDesc] = useState(true);
  const sorted = useMemo(
    () => sortBy(rows, sortKey as keyof ProductLtv, desc),
    [rows, sortKey, desc]
  );
  const toggle = (k: SortKey) => {
    if (sortKey === k) setDesc(!desc);
    else {
      setSortKey(k);
      setDesc(true);
    }
  };
  const arrow = (k: SortKey) => (sortKey === k ? (desc ? ' ▼' : ' ▲') : '');
  const maxUnits = Math.max(...rows.map((r) => r.units), 1);
  const maxLtv = Math.max(...rows.map((r) => r.customerLtvAvg), 1);
  const isVolumeView = highlightField === 'units';

  return (
    <div className="card-section">
      <div className="section-head">
        <span className="section-badge" style={{ background: badgeColor, color: '#fff' }}>
          {badge}
        </span>
        <h3>{title}</h3>
        <span className="section-meta">Click headers to sort</span>
      </div>
      <div className="table-scroll">
        <table className="prod-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Product</th>
              {isVolumeView ? (
                <>
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
                </>
              ) : (
                <>
                  <th className="num" onClick={() => toggle('customerLtvAvg')}>
                    Avg LTV{arrow('customerLtvAvg')}
                  </th>
                  <th className="num" onClick={() => toggle('customerLtvMedian')}>
                    Median LTV{arrow('customerLtvMedian')}
                  </th>
                  <th className="num" onClick={() => toggle('customers')}>
                    Customers{arrow('customers')}
                  </th>
                  <th className="num" onClick={() => toggle('units')}>
                    Units{arrow('units')}
                  </th>
                  <th className="num" onClick={() => toggle('revenue')}>
                    Revenue{arrow('revenue')}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const isHighlight = highlightSku === p.motherSku;
              return (
                <tr
                  key={p.motherSku}
                  className={isHighlight ? 'row-highlight' : ''}
                  onClick={() => onSelect && onSelect(p.motherSku)}
                  style={onSelect ? { cursor: 'pointer' } : undefined}
                >
                  <td className="rank-cell">{i + 1}</td>
                  <td className="name-cell">
                    <div className="prod-name">{p.productName || p.motherSku}</div>
                    <div className="prod-sku">{p.motherSku}</div>
                  </td>
                  {isVolumeView ? (
                    <>
                      <td className="num">
                        <div className="bar-cell">
                          <div className="mini-bar">
                            <div
                              className="mini-bar-fill"
                              style={{
                                width: `${(p.units / maxUnits) * 100}%`,
                                background: badgeColor,
                              }}
                            />
                          </div>
                          <span>{formatNumber(p.units, market)}</span>
                        </div>
                      </td>
                      <td className="num">{formatMoney(p.revenue, market)}</td>
                      <td className="num">{formatNumber(p.customers, market)}</td>
                      <td className="num ltv-cell">
                        {p.customerLtvAvg > 0 ? formatMoney(p.customerLtvAvg, market) : '—'}
                      </td>
                      <td className="num">
                        {p.customerLtvMedian > 0
                          ? formatMoney(p.customerLtvMedian, market)
                          : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="num ltv-cell">
                        <div className="bar-cell">
                          <div className="mini-bar">
                            <div
                              className="mini-bar-fill"
                              style={{
                                width: `${(p.customerLtvAvg / maxLtv) * 100}%`,
                                background: badgeColor,
                              }}
                            />
                          </div>
                          <span>{formatMoney(p.customerLtvAvg, market)}</span>
                        </div>
                      </td>
                      <td className="num">
                        {p.customerLtvMedian > 0
                          ? formatMoney(p.customerLtvMedian, market)
                          : '—'}
                      </td>
                      <td className="num">{formatNumber(p.customers, market)}</td>
                      <td className="num">{formatNumber(p.units, market)}</td>
                      <td className="num">{formatMoney(p.revenue, market)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProductLtvTable({
  products,
  market,
  windowDays,
}: {
  products: ProductLtv[];
  market: Market;
  windowDays: number;
}) {
  const [highlightSku, setHighlightSku] = useState<string | null>(null);

  const minCustomers = topLtvMinCustomers(windowDays);
  const topLtv = useMemo(
    () =>
      sortBy(
        products.filter((p) => p.customers >= minCustomers && p.customerLtvAvg > 0),
        'customerLtvAvg',
        true
      ).slice(0, 15),
    [products, minCustomers]
  );

  if (!products.length) {
    return <div className="empty">No products in this period.</div>;
  }

  return (
    <div className="cac-product-grid">
      <ProductSection
        title={`Top 15 Products · Highest LTV (≥${minCustomers} customers)`}
        badge="A · LTV"
        badgeColor="#d44a8a"
        rows={topLtv}
        highlightField="customerLtvAvg"
        market={market}
        highlightSku={highlightSku}
        onSelect={(sku) => setHighlightSku(highlightSku === sku ? null : sku)}
      />
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { Market, ProductCac } from '@/lib/cac-dashboard/queries';
import { formatMoney, formatNumber } from '@/lib/cac-dashboard/format';

type SortKey = 'units' | 'cac' | 'newCustomers' | 'revenue' | 'allocatedSpend' | 'revenuePerCustomer';

function sortBy<T>(arr: T[], key: keyof T, desc = true): T[] {
  return [...arr].sort((a, b) => {
    const av = (a[key] as unknown as number) ?? 0;
    const bv = (b[key] as unknown as number) ?? 0;
    return desc ? bv - av : av - bv;
  });
}

// Anti-noise threshold for "Top 15 lower CAC" — proportional to window in days
function lowerCacMinNew(days: number) {
  if (days <= 28) return 20;
  if (days <= 60) return 43;
  return 64;
}

interface SectionProps {
  title: string;
  badge: string;
  badgeColor: string;
  rows: ProductCac[];
  highlightField: SortKey;
  market: Market;
  highlightSku?: string | null;
  onSelect?: (sku: string) => void;
}

function ProductSection({ title, badge, badgeColor, rows, highlightField, market, highlightSku, onSelect }: SectionProps) {
  const [sortKey, setSortKey] = useState<SortKey>(highlightField);
  const [desc, setDesc] = useState(highlightField !== 'cac');
  const sorted = useMemo(() => sortBy(rows, sortKey as keyof ProductCac, desc), [rows, sortKey, desc]);
  const toggle = (k: SortKey) => {
    if (sortKey === k) setDesc(!desc);
    else { setSortKey(k); setDesc(k !== 'cac'); }
  };
  const arrow = (k: SortKey) => sortKey === k ? (desc ? ' ▼' : ' ▲') : '';
  const maxUnits = Math.max(...rows.map(r => r.units), 1);
  const isVolumeView = highlightField === 'units';

  return (
    <div className="card-section">
      <div className="section-head">
        <span className="section-badge" style={{ background: badgeColor, color: '#fff' }}>{badge}</span>
        <h3>{title}</h3>
        <span className="section-meta">Clique no cabeçalho para ordenar</span>
      </div>
      <div className="table-scroll">
        <table className="prod-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Produto</th>
              {isVolumeView ? (
                <>
                  <th className="num" onClick={() => toggle('units')}>Unidades{arrow('units')}</th>
                  <th className="num" onClick={() => toggle('revenue')}>Receita{arrow('revenue')}</th>
                  <th className="num" onClick={() => toggle('newCustomers')}>Novos Clientes{arrow('newCustomers')}</th>
                  <th className="num" onClick={() => toggle('allocatedSpend')}>Spend Alocado{arrow('allocatedSpend')}</th>
                  <th className="num" onClick={() => toggle('cac')}>CAC{arrow('cac')}</th>
                  <th className="num" onClick={() => toggle('revenuePerCustomer')}>Receita/Cliente{arrow('revenuePerCustomer')}</th>
                </>
              ) : (
                <>
                  <th className="num" onClick={() => toggle('cac')}>CAC{arrow('cac')}</th>
                  <th className="num" onClick={() => toggle('newCustomers')}>Novos Clientes{arrow('newCustomers')}</th>
                  <th className="num" onClick={() => toggle('allocatedSpend')}>Spend Alocado{arrow('allocatedSpend')}</th>
                  <th className="num" onClick={() => toggle('units')}>Unidades{arrow('units')}</th>
                  <th className="num" onClick={() => toggle('revenue')}>Receita{arrow('revenue')}</th>
                  <th className="num" onClick={() => toggle('revenuePerCustomer')}>Receita/Cliente{arrow('revenuePerCustomer')}</th>
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
                          <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${(p.units / maxUnits) * 100}%`, background: badgeColor }} /></div>
                          <span>{formatNumber(p.units, market)}</span>
                        </div>
                      </td>
                      <td className="num">{formatMoney(p.revenue, market)}</td>
                      <td className="num">{formatNumber(p.newCustomers, market)}</td>
                      <td className="num">{formatMoney(p.allocatedSpend, market)}</td>
                      <td className="num cac-cell">{p.cac > 0 ? formatMoney(p.cac, market) : '—'}</td>
                      <td className="num">{p.revenuePerCustomer > 0 ? formatMoney(p.revenuePerCustomer, market) : '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="num cac-cell">{p.cac > 0 ? formatMoney(p.cac, market) : '—'}</td>
                      <td className="num">{formatNumber(p.newCustomers, market)}</td>
                      <td className="num">{formatMoney(p.allocatedSpend, market)}</td>
                      <td className="num">{formatNumber(p.units, market)}</td>
                      <td className="num">{formatMoney(p.revenue, market)}</td>
                      <td className="num">{p.revenuePerCustomer > 0 ? formatMoney(p.revenuePerCustomer, market) : '—'}</td>
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

export default function ProductTable({
  products,
  market,
  windowDays,
}: {
  products: ProductCac[];
  market: Market;
  windowDays: number;
}) {
  const [highlightSku, setHighlightSku] = useState<string | null>(null);

  const topVolume = useMemo(() => sortBy(products, 'units', true).slice(0, 15), [products]);

  const minNew = lowerCacMinNew(windowDays);
  const lowerCac = useMemo(
    () => sortBy(products.filter((p) => p.newCustomers >= minNew && p.cac > 0), 'cac', false).slice(0, 15),
    [products, minNew]
  );

  if (!products.length) {
    return <div className="empty">Sem produtos no período.</div>;
  }

  return (
    <div className="cac-product-grid">
      <ProductSection
        title={`Top 15 Produtos · por Unidades Vendidas`}
        badge="A · VOLUME"
        badgeColor="#2c7a5b"
        rows={topVolume}
        highlightField="units"
        market={market}
        highlightSku={highlightSku}
        onSelect={(sku) => setHighlightSku(highlightSku === sku ? null : sku)}
      />
      <ProductSection
        title={`Top 15 Produtos · Menor CAC (≥${minNew} novos)`}
        badge="B · EFICIÊNCIA"
        badgeColor="#d44a8a"
        rows={lowerCac}
        highlightField="cac"
        market={market}
        highlightSku={highlightSku}
        onSelect={(sku) => setHighlightSku(highlightSku === sku ? null : sku)}
      />
    </div>
  );
}

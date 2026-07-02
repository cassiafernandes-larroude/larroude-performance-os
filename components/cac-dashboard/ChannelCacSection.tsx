'use client';

// Cassia 2026-07-02: CAC by Channel — spend (all_channels_daily + channel costs)
// x novos clientes atribuídos por UTM da primeira compra (padrões canônicos de
// lib/shared/channel-utms.ts). Canais orgânicos/diretos não têm spend → CAC "—".

import { useEffect, useMemo, useState } from 'react';
import type { Market } from '@/lib/cac-dashboard/queries';
import type { ChannelCacRow } from '@/lib/cac-dashboard/channel-cac';
import { formatMoney, formatNumber } from '@/lib/cac-dashboard/format';

interface ApiResponse {
  rows: ChannelCacRow[];
  totalNewCustomers: number;
  totalSpend: number;
}

interface Props {
  market: Market;
  start: string;
  end: string;
}

export default function ChannelCacSection({ market, start, end }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cac-native/${market}/channel-cac?start=${start}&end=${end}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Error fetching channel CAC');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [market, start, end]);

  const maxShare = useMemo(
    () => Math.max(...(data?.rows || []).map((r) => r.share), 0.0001),
    [data]
  );

  return (
    <div className="card-section">
      <div className="section-head">
        <span className="section-badge" style={{ background: '#0d9488', color: '#fff' }}>
          CHANNELS
        </span>
        <h3>CAC by Channel</h3>
        <span className="section-meta">
          New customers attributed via first-purchase UTMs · organic/direct channels have no spend (CAC —)
        </span>
      </div>
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <span className="spinner" /> Loading channels...
        </div>
      ) : error ? (
        <div style={{ padding: '12px 16px', color: '#b3382f', fontSize: 13 }}>Error: {error}</div>
      ) : data && data.rows.length > 0 ? (
        <div className="table-scroll">
          <table className="prod-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Channel</th>
                <th className="num">Spend</th>
                <th className="num">New Customers</th>
                <th className="num">CAC</th>
                <th className="num">Share of New</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.channel}>
                  <td className="rank-cell">{i + 1}</td>
                  <td className="name-cell">
                    <div className="prod-name">{r.channel}</div>
                  </td>
                  <td className="num">{r.spend != null ? formatMoney(r.spend, market) : '—'}</td>
                  <td className="num">{formatNumber(r.newCustomers, market)}</td>
                  <td className="num cac-cell">
                    {r.cac != null ? formatMoney(r.cac, market, true) : '—'}
                  </td>
                  <td className="num">
                    <div className="bar-cell">
                      <div className="mini-bar">
                        <div
                          className="mini-bar-fill"
                          style={{ width: `${(r.share / maxShare) * 100}%`, background: '#0d9488' }}
                        />
                      </div>
                      <span>{(r.share * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600 }}>
                <td />
                <td className="name-cell">Total</td>
                <td className="num">{formatMoney(data.totalSpend, market)}</td>
                <td className="num">{formatNumber(data.totalNewCustomers, market)}</td>
                <td className="num cac-cell">
                  {data.totalNewCustomers > 0
                    ? formatMoney(data.totalSpend / data.totalNewCustomers, market, true)
                    : '—'}
                </td>
                <td className="num">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
          No channel data in selected period.
        </div>
      )}
    </div>
  );
}

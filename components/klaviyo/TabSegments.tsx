'use client';
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, HBar, fmtMoney, fmtMoneyCents, fmtInt, fmtPct } from './ui';
import type { Market, Period, CustomRange, SegmentRow } from '@/types/klaviyo/models';

export default function TabSegments({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<{ rows: SegmentRow[]; totalSegments: number; totalLists?: number } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null); setErr('');
    api('segments', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading segments...</div>;

  const maxRev = Math.max(...data.rows.map(r => r.revenue), 1);

  return (
    <>
      <SectionHead pill="Segments" pillVariant="purple" title={<><b>All segments by revenue</b> &middot; aggregated by campaigns including each segment</>} right={`${data.rows.length} segments with revenue · ${data.totalSegments} total${data.totalLists ? ` · ${data.totalLists} lists` : ''}`} />

      {data.rows.length === 0 && <div className="empty">No segment with attributed revenue in this period. Check that campaigns have audiences configured.</div>}

      {data.rows.length > 0 && <div className="list-card">
        <table className="list-table">
          <thead><tr>
            <th>Segment</th>
            <th className="num">Recipients</th>
            <th className="num">OR%</th>
            <th className="num">CTR%</th>
            <th className="num">RPR</th>
            <th className="num">Revenue</th>
            <th className="bar">Bar</th>
          </tr></thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.id}>
                <td className="product"><div className="name">{r.name}</div><div className="sku">{r.id}</div></td>
                <td className="num">{fmtInt(r.recipients)}</td>
                <td className="num">{fmtPct(r.openRate)}</td>
                <td className="num">{fmtPct(r.clickRate, 2)}</td>
                <td className="num">{fmtMoneyCents(r.rpr, market)}</td>
                <td className="num"><b>{fmtMoney(r.revenue, market)}</b></td>
                <td className="bar"><HBar value={r.revenue} max={maxRev} color="purple" label={fmtMoney(r.revenue, market)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </>
  );
}

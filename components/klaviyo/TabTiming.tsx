'use client';
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, HBar, fmtUsd, fmtPct, fmtUsdCents } from './ui';
import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

export default function TabTiming({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null); setErr('');
    api('timing', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading timing...</div>;

  const byDay = data.byDay as any[];
  const maxRev = Math.max(...byDay.map(d => d.avgRevenue), 1);
  const maxOR = Math.max(...byDay.map(d => d.avgOpenRate), 1);
  const maxCTR = Math.max(...byDay.map(d => d.avgCtr), 1);

  const best = [...byDay].sort((a,b) => b.avgRpr - a.avgRpr)[0];

  return (
    <>
      <SectionHead pill="Timing" pillVariant="orange" title={<><b>Performance by day of week</b> &middot; derived from send dates</>} />
      <div className="kpi-grid kpi-grid-4">
        <Kpi color="orange" label="Best day (RPR)" value={best?.dayName || '-'} sub={best ? <>RPR <b>{fmtUsdCents(best.avgRpr)}</b></> : ''} />
        <Kpi label="Total campaigns" value={byDay.reduce((s,d) => s+d.campaigns, 0)} />
        <Kpi label="Avg Revenue / day" value={fmtUsd(byDay.reduce((s,d) => s+d.avgRevenue, 0) / 7)} />
        <Kpi label="Avg OR / day" value={fmtPct(byDay.reduce((s,d) => s+d.avgOpenRate, 0) / 7)} />
      </div>

      <div className="list-card">
        <table className="list-table">
          <thead><tr>
            <th>Day</th>
            <th className="num">Campaigns</th>
            <th className="num">Avg Revenue</th>
            <th className="bar">Revenue</th>
            <th className="num">Avg OR%</th>
            <th className="bar">OR</th>
            <th className="num">Avg CTR%</th>
            <th className="bar">CTR</th>
            <th className="num">Avg RPR</th>
          </tr></thead>
          <tbody>
            {byDay.map(d => (
              <tr key={d.dayIndex}>
                <td className="product"><div className="name">{d.dayName}</div></td>
                <td className="num">{d.campaigns}</td>
                <td className="num">{fmtUsd(d.avgRevenue)}</td>
                <td className="bar"><HBar value={d.avgRevenue} max={maxRev} color="orange" label={fmtUsd(d.avgRevenue)} /></td>
                <td className="num">{fmtPct(d.avgOpenRate)}</td>
                <td className="bar"><HBar value={d.avgOpenRate} max={maxOR} color="teal" label={fmtPct(d.avgOpenRate)} /></td>
                <td className="num">{fmtPct(d.avgCtr, 2)}</td>
                <td className="bar"><HBar value={d.avgCtr} max={maxCTR} color="pink" label={fmtPct(d.avgCtr, 2)} /></td>
                <td className="num"><b>{fmtUsdCents(d.avgRpr)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead pill="Hour-of-day" pillVariant="gold" title={<><b>Hour analysis</b> &middot; requires Klaviyo Events API export</>} />
      <div className="empty">{data.hourNote}</div>
    </>
  );
}

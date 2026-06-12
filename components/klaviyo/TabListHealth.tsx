'use client';
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, fmtInt } from './ui';
import DailyBarChart from './DailyBarChart';
import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

export default function TabListHealth({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null); setErr('');
    api('list-health', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading list health...</div>;

  const points = (data.points || []) as any[];
  const subs = points.map(p => ({ date: p.date, value: p.subscriptions, inPeriod: true }));
  const unsubs = points.map(p => ({ date: p.date, value: p.unsubscribes, inPeriod: true }));
  const net = points.map(p => ({ date: p.date, value: p.net, inPeriod: true }));
  const spam = points.map(p => ({ date: p.date, value: p.spam || 0, inPeriod: true }));
  const bounces = points.map(p => ({ date: p.date, value: p.bounces || 0, inPeriod: true }));

  const isCompact = points.length > 0 && points.length <= 14;
  const gridCls = isCompact ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4' : 'space-y-4 mt-4';

  return (
    <>
      <SectionHead pill="List Health" pillVariant="green" title={<><b>List growth</b> &middot; Subscribed vs Unsubscribed &middot; {data.interval || 'auto'} granularity</>} />
      <div className="kpi-grid kpi-grid-4">
        <Kpi color="green" label="Subscriptions" value={fmtInt(data.total.subscriptions)} sub="period total" />
        <Kpi color="red" label="Unsubscribes" value={fmtInt(data.total.unsubscribes)} sub="period total" />
        <Kpi color={data.net >= 0 ? 'teal' : 'red'} label="Net Growth" value={(data.net >= 0 ? '+' : '') + fmtInt(data.net)} sub="subs - unsubs" />
        <Kpi label={data.interval === 'day' ? 'Days' : data.interval === 'week' ? 'Weeks' : 'Months'} value={points.length} sub={`${data.interval || 'auto'} granularity`} />
      </div>

      <SectionHead pill="Charts" pillVariant="green" title={<><b>Series</b> &middot; subs/unsubs/spam/bounce</>} right={data.metricsUsed?.subscribed ? data.metricsUsed.subscribed : ''} />
      <div className={gridCls}>
        <DailyBarChart title="Subscriptions" data={subs} color="#267838" unit="number" market={market} />
        <DailyBarChart title="Unsubscribes" data={unsubs} color="#ef4444" unit="number" market={market} />
        <DailyBarChart title="Net Growth" data={net} color="#0d9488" unit="number" market={market} />
        <DailyBarChart title="Bounces" data={bounces} color="#f59e0b" unit="number" market={market} />
        <DailyBarChart title="Spam Complaints" data={spam} color="#B82F2F" unit="number" market={market} />
      </div>
    </>
  );
}

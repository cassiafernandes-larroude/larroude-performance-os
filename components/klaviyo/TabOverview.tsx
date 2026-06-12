'use client';

import { useEffect, useState } from 'react';
import type { Market, Period } from '@/lib/klaviyo/types';
import { buildKlaviyoUrl, fmtMoney, fmtPct, fmtNumber } from './fetcher';

interface Props {
  market: Market;
  period: Period;
  customRange?: { from: string; to: string };
}

export default function TabOverview({ market, period, customRange }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = buildKlaviyoUrl('overview', market, period, customRange);
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [market, period, customRange?.from, customRange?.to]);

  if (loading) return <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Loading Klaviyo {market}…</div>;
  if (error) return <div className="card p-4" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}><strong>Error:</strong> {error}</div>;
  if (!data) return null;

  const k = data.kpis;
  const lh = data.listHealth;

  return (
    <div className="space-y-5">
      {/* KPIs gerais */}
      <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <Kpi label="TOTAL REVENUE" value={fmtMoney(k.totalRevenue, market, true)} hint="campaigns + flows" />
        <Kpi label="CAMPAIGNS REV" value={fmtMoney(k.campaignsRevenue, market, true)} hint={`${k.campaignsCount} sent`} />
        <Kpi label="FLOWS REV" value={fmtMoney(k.flowsRevenue, market, true)} hint={`${k.flowsCount} live`} />
        <Kpi label="OPEN RATE" value={fmtPct(k.openRate, 1)} hint={`${fmtNumber(k.totalOpens, market)} opens`} />
        <Kpi label="CLICK RATE" value={fmtPct(k.clickRate, 2)} hint={`${fmtNumber(k.totalClicks, market)} clicks`} />
        <Kpi label="UNSUB RATE" value={fmtPct(k.unsubRate, 3)} hint={`${fmtNumber(k.totalUnsubs, market)} unsubs`} />
        <Kpi label="REV / RECIP." value={fmtMoney(k.revenuePerRecipient, market)} hint={`${fmtNumber(k.totalRecipients, market)} recipients`} />
        <Kpi label="ORDERS" value={fmtNumber(k.totalOrders, market)} hint="attributed" />
      </div>

      {/* List Health */}
      <section className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
          List Health (period)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label="Subscriptions" value={fmtNumber(lh.subs, market)} tone="good" />
          <Mini label="Unsubscribes" value={fmtNumber(lh.unsubs, market)} tone="warn" />
          <Mini label="Bounces" value={fmtNumber(lh.bounces, market)} tone="warn" />
          <Mini label="Spam complaints" value={fmtNumber(lh.spam, market)} tone="bad" />
        </div>
      </section>

      {/* Top Campaigns + Top Flows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
            Top 10 Campaigns by Revenue
          </div>
          <RowList items={data.topCampaigns} market={market} />
        </section>
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
            Top 10 Flows by Revenue
          </div>
          <RowList items={data.topFlows} market={market} />
        </section>
      </div>

      <div className="text-[11px] italic px-2" style={{ color: '#9ca3af' }}>
        {data.period.start} → {data.period.end} · cached 6h · fetched {data.durationMs}ms
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-2.5 flex flex-col">
      <div className="text-[8.5px] font-bold tracking-wider text-steel uppercase leading-tight">{label}</div>
      <div className="text-xl font-bold text-ink leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[9px] text-steel mt-0.5 leading-tight">{hint}</div>}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' }) {
  const colors = {
    good: { bg: '#ecf6f0', border: '#2c7a5b', text: '#1d5b41' },
    warn: { bg: '#fff7e0', border: '#c0822a', text: '#8a5b18' },
    bad: { bg: '#fff5f5', border: '#b3382f', text: '#7a221c' },
  }[tone];
  return (
    <div className="rounded-xl p-3" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.text }}>{label}</div>
      <div className="font-bold mt-1" style={{ color: colors.text, fontSize: 'clamp(18px, 1.8vw, 22px)' }}>{value}</div>
    </div>
  );
}

function RowList({ items, market }: { items: any[]; market: Market }) {
  if (!items?.length) return <div className="text-[12px]" style={{ color: '#9ca3af' }}>No data.</div>;
  const max = Math.max(...items.map((i) => i.revenue), 1);
  return (
    <div className="space-y-1.5">
      {items.map((row, i) => (
        <div key={row.id} className="flex items-center gap-2">
          <span className="text-[10px] font-bold w-5" style={{ color: '#9ca3af' }}>#{i + 1}</span>
          <div className="flex-1 text-[12px] truncate" style={{ color: '#374151' }} title={row.name}>{row.name}</div>
          <div className="h-3 rounded" style={{ width: 40, background: '#fef2f8' }}>
            <div className="h-full rounded" style={{ width: `${(row.revenue / max) * 100}%`, background: '#ec4899' }} />
          </div>
          <div className="text-[11px] font-num font-semibold w-20 text-right">{fmtMoney(row.revenue, market, true)}</div>
        </div>
      ))}
    </div>
  );
}

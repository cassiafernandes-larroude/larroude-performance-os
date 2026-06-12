'use client';

import { useEffect, useState } from 'react';
import type { Market, Period } from '@/lib/klaviyo/types';
import { buildKlaviyoUrl, fmtMoney, fmtPct, fmtNumber } from './fetcher';
import DailyBarChart from './DailyBarChart';

interface Props {
  market: Market;
  period: Period;
  customRange?: { from: string; to: string };
}

export default function TabCampaigns({ market, period, customRange }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'revenue' | 'openRate' | 'clickRate' | 'unsubRate' | 'sentAt'>('revenue');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(buildKlaviyoUrl('campaigns', market, period, customRange))
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [market, period, customRange?.from, customRange?.to]);

  if (loading) return <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Loading campaigns…</div>;
  if (error) return <div className="card p-4" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}>{error}</div>;
  if (!data) return null;

  const rows = [...(data.rows || [])].sort((a, b) => {
    if (sortKey === 'sentAt') return String(b.sentAt).localeCompare(String(a.sentAt));
    return (b as any)[sortKey] - (a as any)[sortKey];
  });
  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
        <Kpi label="REVENUE" value={fmtMoney(t.revenue, market, true)} />
        <Kpi label="RECIPIENTS" value={fmtNumber(t.recipients, market)} />
        <Kpi label="OPEN RATE" value={fmtPct(t.openRate, 1)} />
        <Kpi label="CLICK RATE" value={fmtPct(t.clickRate, 2)} />
        <Kpi label="UNSUB RATE" value={fmtPct(t.unsubRate, 3)} />
        <Kpi label="REV / RECIP." value={fmtMoney(t.revenuePerRecipient, market)} />
        <Kpi label="CAMPAIGNS" value={fmtNumber(rows.length, market)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <DailyBarChart title="Revenue" data={data.daily?.revenue || []} color="#ec4899" unit="currency" market={market} height={180} />
        <DailyBarChart title="Recipients" data={data.daily?.recipients || []} color="#5d4ec5" unit="number" market={market} height={180} />
        <DailyBarChart title="Opens" data={data.daily?.opens || []} color="#0ea5e9" unit="number" market={market} height={180} />
        <DailyBarChart title="Unsubs" data={data.daily?.unsubscribes || []} color="#dc2626" unit="number" market={market} height={180} />
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase font-bold text-steel tracking-wide border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Campaign</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 cursor-pointer" onClick={() => setSortKey('sentAt')}>Sent</th>
              <th className="px-3 py-2.5 text-right">Recipients</th>
              <th className="px-3 py-2.5 text-right cursor-pointer" onClick={() => setSortKey('openRate')}>OR</th>
              <th className="px-3 py-2.5 text-right cursor-pointer" onClick={() => setSortKey('clickRate')}>CTR</th>
              <th className="px-3 py-2.5 text-right cursor-pointer" onClick={() => setSortKey('unsubRate')}>Unsub</th>
              <th className="px-3 py-2.5 text-right cursor-pointer" onClick={() => setSortKey('revenue')}>Revenue</th>
              <th className="px-3 py-2.5 text-right">RPR</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                <td className="px-3 py-2 text-[10px]" style={{ color: '#9ca3af' }}>{i + 1}</td>
                <td className="px-3 py-2 max-w-[280px] truncate" title={r.name}>{r.name}</td>
                <td className="px-3 py-2 text-[10px] font-semibold" style={{ color: '#6b7280' }}>{r.type}</td>
                <td className="px-3 py-2 text-[11px]" style={{ color: '#6b7280' }}>{r.sentAt?.slice(0, 10) || '—'}</td>
                <td className="px-3 py-2 text-right font-num">{fmtNumber(r.recipients, market)}</td>
                <td className="px-3 py-2 text-right font-num">{fmtPct(r.openRate, 1)}</td>
                <td className="px-3 py-2 text-right font-num">{fmtPct(r.clickRate, 2)}</td>
                <td className="px-3 py-2 text-right font-num">{fmtPct(r.unsubRate, 3)}</td>
                <td className="px-3 py-2 text-right font-num font-semibold">{fmtMoney(r.revenue, market, true)}</td>
                <td className="px-3 py-2 text-right font-num">{fmtMoney(r.revenuePerRecipient, market)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2.5 flex flex-col">
      <div className="text-[8.5px] font-bold tracking-wider text-steel uppercase">{label}</div>
      <div className="text-xl font-bold text-ink leading-tight mt-0.5">{value}</div>
    </div>
  );
}

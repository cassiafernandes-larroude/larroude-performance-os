'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Market, Period, FlowCategory } from '@/lib/klaviyo/types';
import { FLOW_CATEGORY_LABELS } from '@/lib/klaviyo/classify';
import { buildKlaviyoUrl, fmtMoney, fmtPct, fmtNumber } from './fetcher';

interface Props {
  market: Market;
  period: Period;
  customRange?: { from: string; to: string };
}

const SUB_TABS: (FlowCategory | 'ALL')[] = ['ALL', 'WELCOME_TRUST', 'HYGIENE_WINBACK', 'FAMILY_CROSSSELL', 'POST_PURCHASE', 'TRIGGERS', 'LIFECYCLE_OTHER'];

export default function TabFlows({ market, period, customRange }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<FlowCategory | 'ALL'>('ALL');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(buildKlaviyoUrl('flows', market, period, customRange))
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [market, period, customRange?.from, customRange?.to]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (subTab === 'ALL') return data.rows;
    return data.rows.filter((r: any) => r.category === subTab);
  }, [data, subTab]);

  if (loading) return <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Loading flows…</div>;
  if (error) return <div className="card p-4" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}>{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
        <Kpi label="REVENUE" value={fmtMoney(data.totals.revenue, market, true)} />
        <Kpi label="LIVE FLOWS" value={fmtNumber(data.rows.length, market)} />
        <Kpi label="RECIPIENTS" value={fmtNumber(data.totals.recipients, market)} />
        <Kpi label="OPEN RATE" value={fmtPct(data.totals.openRate, 1)} />
        <Kpi label="CLICK RATE" value={fmtPct(data.totals.clickRate, 2)} />
        <Kpi label="UNSUB RATE" value={fmtPct(data.totals.unsubRate, 3)} />
      </div>

      <section className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>Revenue by category</div>
        <div className="space-y-1.5">
          {data.byCategory.map((c: any) => (
            <div key={c.category} className="flex items-center gap-3">
              <div className="w-44 text-[12px]" style={{ color: '#374151' }}>{c.label}</div>
              <div className="flex-1 h-5 rounded" style={{ background: '#fef2f8' }}>
                <div className="h-full rounded" style={{
                  width: `${data.totals.revenue > 0 ? (c.revenue / data.totals.revenue) * 100 : 0}%`,
                  background: '#ec4899',
                }} />
              </div>
              <div className="w-24 text-right text-[12px] font-num font-semibold">{fmtMoney(c.revenue, market, true)}</div>
              <div className="w-12 text-right text-[10px]" style={{ color: '#9ca3af' }}>{c.count}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-2 flex-wrap">
        {SUB_TABS.map((t) => {
          const active = subTab === t;
          const label = t === 'ALL' ? 'All' : FLOW_CATEGORY_LABELS[t];
          const count = t === 'ALL' ? data.rows.length : data.rows.filter((r: any) => r.category === t).length;
          return (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`text-[12px] font-semibold rounded-full px-3 py-1.5 transition ${
                active ? 'bg-[#1a1a1a] text-white' : 'bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0]'
              }`}
            >
              {label} <span className="opacity-60 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase font-bold text-steel tracking-wide border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Flow</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5 text-right">Recipients</th>
              <th className="px-3 py-2.5 text-right">OR</th>
              <th className="px-3 py-2.5 text-right">CTR</th>
              <th className="px-3 py-2.5 text-right">Unsub</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right">RPR</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r: any, i: number) => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                <td className="px-3 py-2 text-[10px]" style={{ color: '#9ca3af' }}>{i + 1}</td>
                <td className="px-3 py-2 max-w-[280px] truncate" title={r.name}>{r.name}</td>
                <td className="px-3 py-2 text-[10px] font-semibold" style={{ color: '#6b7280' }}>{r.flowType}</td>
                <td className="px-3 py-2 text-[10px]" style={{ color: '#6b7280' }}>{FLOW_CATEGORY_LABELS[r.category as FlowCategory] || r.category}</td>
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

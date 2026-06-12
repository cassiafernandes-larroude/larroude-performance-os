'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Market, Period, FlowCategory, DailyPoint } from '@/lib/klaviyo/types';
import { FLOW_CATEGORY_LABELS } from '@/lib/klaviyo/classify';
import { buildKlaviyoUrl, fmtMoney, fmtPct, fmtNumber } from './fetcher';
import DailyBarChart from './DailyBarChart';
import MultiLineChart from './MultiLineChart';

interface Props {
  market: Market;
  period: Period;
  customRange?: { from: string; to: string };
}

const SUB_TABS: (FlowCategory | 'ALL')[] = ['ALL', 'WELCOME_TRUST', 'HYGIENE_WINBACK', 'FAMILY_CROSSSELL', 'POST_PURCHASE', 'TRIGGERS', 'LIFECYCLE_OTHER'];
const STEP_COLORS = ['#ec4899', '#5d4ec5', '#0ea5e9', '#10b981', '#f59e0b', '#dc2626', '#06b6d4', '#a16207', '#be185d', '#7c3aed'];

export default function TabFlows({ market, period, customRange }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<FlowCategory | 'ALL'>('ALL');
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [steps, setSteps] = useState<any[] | null>(null);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [byStepView, setByStepView] = useState(false);

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

  // Buscar steps quando seleciona flow
  useEffect(() => {
    if (!selectedFlowId) { setSteps(null); return; }
    let cancelled = false;
    setStepsLoading(true);
    const url = `/api/klaviyo/flow-steps/${market}?flowId=${selectedFlowId}&period=${period}${customRange ? `&from=${customRange.from}&to=${customRange.to}` : ''}`;
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => { if (!cancelled) { setSteps(json.steps || []); setStepsLoading(false); } })
      .catch(() => { if (!cancelled) { setSteps([]); setStepsLoading(false); } });
    return () => { cancelled = true; };
  }, [selectedFlowId, market, period, customRange?.from, customRange?.to]);

  if (loading) return <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Loading flows…</div>;
  if (error) return <div className="card p-4" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}>{error}</div>;
  if (!data) return null;

  const daily = data.daily || {};
  const selectedFlow = filteredRows.find((r: any) => r.id === selectedFlowId);

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

      {/* Daily charts agregado de flows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <DailyBarChart title="Revenue" data={daily.revenue || []} color="#2c7a5b" unit="currency" market={market} height={180} />
        <DailyBarChart title="Recipients" data={daily.recipients || []} color="#5d4ec5" unit="number" market={market} height={180} />
        <DailyBarChart title="Opens" data={daily.opens || []} color="#0ea5e9" unit="number" market={market} height={180} />
        <DailyBarChart title="Clicks" data={daily.clicks || []} color="#d97757" unit="number" market={market} height={180} />
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

      {/* Sub-tabs por categoria */}
      <div className="flex items-center gap-2 flex-wrap">
        {SUB_TABS.map((t) => {
          const active = subTab === t;
          const label = t === 'ALL' ? 'All' : FLOW_CATEGORY_LABELS[t];
          const count = t === 'ALL' ? data.rows.length : data.rows.filter((r: any) => r.category === t).length;
          return (
            <button
              key={t}
              onClick={() => { setSubTab(t); setSelectedFlowId(''); setByStepView(false); }}
              className={`text-[12px] font-semibold rounded-full px-3 py-1.5 transition ${
                active ? 'bg-[#1a1a1a] text-white' : 'bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0]'
              }`}
            >
              {label} <span className="opacity-60 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Dropdown de flow específico */}
      {filteredRows.length > 0 && (
        <section className="card p-4 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#9ca3af' }}>Drill into flow:</span>
          <select
            value={selectedFlowId}
            onChange={(e) => { setSelectedFlowId(e.target.value); setByStepView(false); }}
            className="rounded-lg px-3 py-1.5 text-[12px]"
            style={{ border: '1px solid #e5e3de', background: '#fff' }}
          >
            <option value="">— Select a flow —</option>
            {filteredRows.map((r: any) => (
              <option key={r.id} value={r.id}>{r.name} · {fmtMoney(r.revenue, market, true)}</option>
            ))}
          </select>
          {selectedFlow && (
            <>
              <span className="text-[11px]" style={{ color: '#6b7280' }}>
                Recipients: <strong>{fmtNumber(selectedFlow.recipients, market)}</strong>
                {' · '}Revenue: <strong>{fmtMoney(selectedFlow.revenue, market, true)}</strong>
              </span>
              <button
                onClick={() => setByStepView((v) => !v)}
                className={`text-[11px] font-semibold rounded-full px-3 py-1 ml-auto ${
                  byStepView ? 'bg-[#1a1a1a] text-white' : 'bg-[#ebe9e3]'
                }`}
              >
                {byStepView ? '✓ By Step' : 'View by Step'}
              </button>
            </>
          )}
        </section>
      )}

      {/* View Por Step (multi-line) */}
      {byStepView && selectedFlowId && (
        <div>
          {stepsLoading ? (
            <div className="card p-6 text-center text-sm" style={{ color: '#6b7280' }}>Loading steps…</div>
          ) : !steps?.length ? (
            <div className="card p-6 text-[12px] italic text-center" style={{ color: '#9ca3af' }}>No step-level data.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <MultiLineChart
                title="Revenue per step"
                market={market}
                unit="currency"
                series={steps.map((s, i) => ({
                  name: s.stepName || s.stepId.slice(0, 8),
                  color: STEP_COLORS[i % STEP_COLORS.length],
                  data: s.daily.revenue || [],
                }))}
              />
              <MultiLineChart
                title="Opens per step"
                market={market}
                unit="number"
                series={steps.map((s, i) => ({
                  name: s.stepName || s.stepId.slice(0, 8),
                  color: STEP_COLORS[i % STEP_COLORS.length],
                  data: s.daily.opens || [],
                }))}
              />
              <MultiLineChart
                title="Clicks per step"
                market={market}
                unit="number"
                series={steps.map((s, i) => ({
                  name: s.stepName || s.stepId.slice(0, 8),
                  color: STEP_COLORS[i % STEP_COLORS.length],
                  data: s.daily.clicks || [],
                }))}
              />
              <MultiLineChart
                title="Unsubscribes per step"
                market={market}
                unit="number"
                series={steps.map((s, i) => ({
                  name: s.stepName || s.stepId.slice(0, 8),
                  color: STEP_COLORS[i % STEP_COLORS.length],
                  data: s.daily.unsubscribes || [],
                }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Tabela de flows */}
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

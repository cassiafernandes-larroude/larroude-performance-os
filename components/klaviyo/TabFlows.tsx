'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, HBar, StatusBadge, Pagination, Modal, fmtMoney, fmtMoneyCents, fmtRpr, fmtInt, fmtPct } from './ui';
import DailyBarChart from './DailyBarChart';
import MultiLineChart from './MultiLineChart';
import { KpiDelta, fmtCompact } from './KpiDelta';
import { FLOW_BENCHMARKS, signalFor } from '@/lib/klaviyo/classify';
import type { Market, Period, CustomRange, FlowRow, BenchmarkRow, FlowCategory } from '@/types/klaviyo/models';
import { FLOW_CATEGORIES } from '@/types/klaviyo/models';

const PER = 30;
const TOP = 10;

function TopRankCard({ title, rows, accessor, formatter, color, accentColor }: {
  title: string;
  rows: FlowRow[];
  accessor: (r: FlowRow) => number;
  formatter: (v: number) => string;
  color: string;
  accentColor: string;
}) {
  const sorted = [...rows].sort((a, b) => accessor(b) - accessor(a)).slice(0, TOP);
  const max = Math.max(...sorted.map(accessor), 1);
  return (
    <div className="list-card" style={{ marginBottom: 20 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1.5px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, background: accentColor, borderRadius: 2 }} />
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-2)' }}>{title}</span>
      </div>
      <table className="list-table">
        <thead><tr><th>#</th><th>Flow</th><th>Type</th><th className="bar">Value</th><th className="num">Metric</th></tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id}>
              <td><b>{i + 1}</b></td>
              <td className="product"><div className="name">{r.name}</div><div className="sku">{r.flowType}</div></td>
              <td><StatusBadge kind="teal" label={r.flowType} /></td>
              <td className="bar"><HBar value={accessor(r)} max={max} color={color} label={formatter(accessor(r))} /></td>
              <td className="num"><b>{formatter(accessor(r))}</b></td>
            </tr>
          ))}
          {sorted.length === 0 && <tr><td colSpan={5} className="empty" style={{ textAlign: 'center', padding: 24 }}>No data</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function BenchmarkRowCard({ r, color }: { r: BenchmarkRow; color: string }) {
  const sigKind = r.signal === 'SCALE' ? 'green' : r.signal === 'STOP' ? 'red' : r.signal === 'FIX' ? 'gold' : 'gray';
  const dOR = (r.orPct || 0) - (r.orBaseline || 0);
  const dCTR = (r.ctrPct || 0) - (r.ctrBaseline || 0);
  const dRPR = (r.rpr || 0) - (r.rprBaseline || 0);
  return (
    <div className="bm-card" key={r.type}>
      <h4>{r.type} <span style={{ color: 'var(--ink-3)', fontWeight: 500, fontSize: 12, marginLeft: 6 }}>· {r.count} sends</span> <span style={{ float: 'right' }}><StatusBadge kind={sigKind as any} label={r.signal} /></span></h4>
      <div className="bm-row">
        <div className="bm-label">OR%</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (r.orPct/r.orTarget)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtPct(r.orPct)}</div>
        <div className="bm-bench">b: {fmtPct(r.orBaseline)} · t: {fmtPct(r.orTarget)} · <span style={{ color: dOR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dOR >= 0 ? '+' : ''}{dOR.toFixed(1)}</span></div>
      </div>
      <div className="bm-row">
        <div className="bm-label">CTR%</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (r.ctrPct/r.ctrTarget)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtPct(r.ctrPct, 2)}</div>
        <div className="bm-bench">b: {fmtPct(r.ctrBaseline, 2)} · t: {fmtPct(r.ctrTarget, 2)} · <span style={{ color: dCTR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dCTR >= 0 ? '+' : ''}{dCTR.toFixed(2)}</span></div>
      </div>
      <div className="bm-row">
        <div className="bm-label">RPR</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (r.rpr/r.rprTarget)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtRpr(r.rpr)}</div>
        <div className="bm-bench">b: {fmtRpr(r.rprBaseline)} · t: {fmtRpr(r.rprTarget)} · <span style={{ color: dRPR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dRPR >= 0 ? '+' : ''}${dRPR.toFixed(2)}</span></div>
      </div>
    </div>
  );
}

export default function TabFlows({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<{ rows: FlowRow[]; flowsSeries?: any[]; campsSeries?: any[]; interval?: string; totals?: any; delta?: any } | null>(null);
  const [bm, setBm] = useState<{ campaigns: BenchmarkRow[]; flows: BenchmarkRow[] } | null>(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drill, setDrill] = useState<FlowRow | null>(null);
  const [category, setCategory] = useState<FlowCategory | 'ALL'>('ALL');
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [flowSeries, setFlowSeries] = useState<any>(null);
  const [bulkSeries, setBulkSeries] = useState<any>(null);
  const [stepView, setStepView] = useState<'FLOW' | 'STEP'>('FLOW');
  const [flowSteps, setFlowSteps] = useState<any>(null);

  useEffect(() => {
    setData(null); setBm(null); setErr(''); setPage(1);
    api('flows', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
    api('benchmarks', market, period, custom).then(setBm).catch(() => {});
  }, [market, period, custom?.start, custom?.end]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.rows.filter(r => !r.isCS
      && (category === 'ALL' || r.category === category)
      && (!q || r.name.toLowerCase().includes(q) || r.flowType.toLowerCase().includes(q)));
  }, [data, search, category]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { ALL: 0 };
    if (!data) return out;
    for (const r of data.rows) {
      if (r.isCS) continue;
      out.ALL = (out.ALL || 0) + 1;
      const c = r.category || 'LIFECYCLE_OTHER';
      out[c] = (out[c] || 0) + 1;
    }
    return out;
  }, [data]);

  // Resetar drill-down quando muda filtro
  useEffect(() => {
    setPage(1); setSelectedFlowId(''); setFlowSeries(null); setBulkSeries(null); setStepView('FLOW'); setFlowSteps(null);
  }, [search, category]);

  // Bulk series para uma CATEGORIA (sem flow selecionado) — retry automático em 429
  useEffect(() => {
    setBulkSeries(null);
    if (category === 'ALL' || selectedFlowId || !data) return;
    const catRows = data.rows.filter(r => !r.isCS && r.category === category);
    const ids = catRows.map(r => r.id).slice(0, 20).join(',');
    if (!ids) return;
    const q = `market=${market}&period=${period}&flowIds=${ids}${custom?.start ? `&start=${custom.start}&end=${custom.end}` : ''}`;
    let cancelled = false;
    let attempt = 0;
    async function tryFetch(): Promise<void> {
      if (cancelled) return;
      attempt++;
      try {
        const r = await fetch(`/api/flow-series-bulk?${q}`);
        const j = await r.json();
        if (cancelled) return;
        if (j.throttled && attempt < 3) {
          // espera 30s e tenta de novo
          setBulkSeries({ ...j, loading: true });
          setTimeout(tryFetch, 30000);
          return;
        }
        setBulkSeries(j);
      } catch { if (!cancelled) setBulkSeries({ error: 'fetch failed', points: [] }); }
    }
    tryFetch();
    return () => { cancelled = true; };
  }, [category, data, market, period, custom?.start, custom?.end, selectedFlowId]);

  // Single flow series — primeiro tenta extrair do bulkSeries (já cacheado), fallback pra /api/flow-series
  useEffect(() => {
    setFlowSeries(null);
    if (!selectedFlowId) return;
    // Se bulk já carregou e tem esse flow, usa ele
    if (bulkSeries?.perFlow?.[selectedFlowId]) {
      setFlowSeries({ points: bulkSeries.perFlow[selectedFlowId] });
      return;
    }
    // Senão busca direto
    fetch(`/api/flow-series?market=${market}&period=${period}&flowId=${selectedFlowId}${custom?.start ? `&start=${custom.start}&end=${custom.end}` : ''}`)
      .then(r => r.json()).then(setFlowSeries).catch(() => {});
  }, [selectedFlowId, market, period, custom?.start, custom?.end, bulkSeries]);

  // Step data: fetch sempre que selecionar um flow (pra saber stepCount e habilitar toggle)
  useEffect(() => {
    setFlowSteps(null);
    if (!selectedFlowId) return;
    fetch(`/api/flow-steps?market=${market}&period=${period}&flowId=${selectedFlowId}${custom?.start ? `&start=${custom.start}&end=${custom.end}` : ''}`)
      .then(r => r.json()).then(setFlowSteps).catch(() => {});
  }, [selectedFlowId, market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading flows ({market} / {period})...</div>;

  const maxRev = Math.max(...rows.map(r => r.revenue), 1);
  const pageRows = rows.slice((page-1)*PER, page*PER);

  // Fonte global de fallback
  const fW = (data.flowsSeries || []) as any[];

  // Fonte dinâmica baseada no contexto: flow individual > categoria bulk > global
  const chartSource: any[] = selectedFlowId && flowSeries?.points ? flowSeries.points
    : (category !== 'ALL' && bulkSeries?.points ? bulkSeries.points : fW);

  const flowRevPts = chartSource.map(p => ({ date: p.date, value: p.revenue || 0, inPeriod: true }));
  const flowSendPts = chartSource.map(p => ({ date: p.date, value: p.recipients || 0, inPeriod: true }));
  const flowOrPts = chartSource.map(p => ({ date: p.date, value: p.openRate || 0, inPeriod: true }));
  const flowCtrPts = chartSource.map(p => ({ date: p.date, value: p.clickRate || 0, inPeriod: true }));
  const flowRprPts = chartSource.map(p => ({ date: p.date, value: p.rpr || 0, inPeriod: true }));
  const chartScope = selectedFlowId ? 'flow selecionado' : (category !== 'ALL' ? 'categoria' : 'todos os flows');
  const chartLoading = (selectedFlowId && !flowSeries) || (category !== 'ALL' && !selectedFlowId && !bulkSeries);

  const gridCls = 'space-y-4 mt-4';

  // Totals: ALL → server / categoria sem flow → soma das rows / flow selecionado → row daquele flow
  const t: any = (() => {
    if (selectedFlowId) {
      const r = rows.find(rr => rr.id === selectedFlowId);
      if (r) return {
        count: 1, revenue: r.revenue, recipients: r.recipients, delivered: r.delivered,
        opens: r.opens, clicks: r.clicks, conversions: r.conversions,
        openRate: r.openRate, clickRate: r.clickRate, rpr: r.rpr,
        bounceRate: r.bounceRate, unsubRate: r.unsubRate
      };
    }
    if (category === 'ALL') return data.totals || {};
    const sum = (k: keyof FlowRow) => rows.reduce((s, r) => s + ((r as any)[k] || 0), 0);
    const revenue = sum('revenue'), recipients = sum('recipients'), delivered = sum('delivered');
    const opens = sum('opens'), clicks = sum('clicks');
    return {
      count: rows.length, revenue, recipients, delivered, opens, clicks,
      conversions: sum('conversions'),
      openRate: delivered ? (opens / delivered) * 100 : 0,
      clickRate: delivered ? (clicks / delivered) * 100 : 0,
      rpr: recipients ? revenue / recipients : 0
    };
  })();
  const d = category === 'ALL' && !selectedFlowId ? (data.delta || {}) : {};
  const convRate = t.recipients ? (t.conversions / t.recipients) * 100 : 0;
  const ACC = '#5B3FA0';
  const sym = market === 'BR' ? 'R$' : '$';

  const eligible = rows.filter(r => r.recipients >= 500);
  const cat = FLOW_CATEGORIES.find(c => c.id === category);

  return (
    <>
      {/* Sub-tabs por categoria */}
      <div className="flow-subtabs">
        <button className={'flow-subtab' + (category === 'ALL' ? ' active' : '')} onClick={() => setCategory('ALL')}>
          Visão Geral <span className="badge">{counts.ALL || 0}</span>
        </button>
        {FLOW_CATEGORIES.map(c => (
          <button key={c.id} className={'flow-subtab' + (category === c.id ? ' active' : '')} onClick={() => setCategory(c.id)}>
            {c.label} <span className="badge">{counts[c.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Descrição da categoria + subtypes */}
      {category !== 'ALL' && cat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '10px 0 20px' }}>
          <span style={{ color: 'var(--ink-2)' }}>{cat.label}</span>
          <span>—</span>
          <span>{cat.subtypes}</span>
        </div>
      )}

      {/* Drill-down: dropdown de flows */}
      {category !== 'ALL' && rows.length > 0 && (
        <div className="filter-card" style={{ marginBottom: 18 }}>
          <div className="filter-group">
            <span className="filter-label">Flow</span>
            <select className="search-input" value={selectedFlowId} onChange={e => setSelectedFlowId(e.target.value)} style={{ minWidth: 320, padding: '8px 14px' }}>
              <option value="">— Visão geral da categoria —</option>
              {rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {selectedFlowId && (
              <button className="btn-pill" onClick={() => setSelectedFlowId('')}>← Voltar à visão geral</button>
            )}
          </div>
          {selectedFlowId && flowSteps && flowSteps.stepCount > 1 && (
            <div className="filter-group">
              <span className="filter-label">Visão</span>
              <div className="btn-row">
                <button className={'btn-pill' + (stepView === 'FLOW' ? ' active' : '')} onClick={() => setStepView('FLOW')}>Flow Inteiro</button>
                <button className={'btn-pill' + (stepView === 'STEP' ? ' active' : '')} onClick={() => setStepView('STEP')}>Por Step ({flowSteps.stepCount})</button>
              </div>
            </div>
          )}
        </div>
      )}

      <SectionHead pill="Flows KPIs" pillVariant="purple" title={<><b>{selectedFlowId ? rows.find(r => r.id === selectedFlowId)?.name : (category === 'ALL' ? 'Todos os flows' : cat?.label)}</b> · {selectedFlowId ? 'performance individual do flow' : (category === 'ALL' ? 'deltas vs prior + YoY' : 'agregado da categoria')}</>} right={`${selectedFlowId ? 1 : rows.length} ${selectedFlowId ? 'flow' : 'flows'}`} />
      <div className="kpi-grid kpi-grid-8" style={{ marginBottom: 20 }}>
        <KpiDelta label="Flow Revenue" value={sym + fmtCompact(t.revenue || 0)} prior={d.revenue?.prior} yoy={d.revenue?.yoy} sub={`${selectedFlowId ? 1 : rows.length} flows · RPR ${fmtRpr(t.rpr || 0, market)}`} accent={ACC} />
        <KpiDelta label="Conversions" value={fmtCompact(t.conversions || 0)} prior={d.conversions?.prior} yoy={d.conversions?.yoy} sub={`Conv. rate ${convRate.toFixed(3)}%`} accent={ACC} />
        <KpiDelta label="Total Clicks" value={fmtCompact(t.clicks || 0)} prior={d.clicks?.prior} yoy={d.clicks?.yoy} sub="unique clicks" accent={ACC} />
        <KpiDelta label="Open Rate" value={fmtPct(t.openRate || 0)} prior={d.openRate?.prior} yoy={d.openRate?.yoy} sub="all flows · deliv-based" accent={ACC} />
        <KpiDelta label="Click Rate (CTR)" value={fmtPct(t.clickRate || 0, 2)} prior={d.clickRate?.prior} yoy={d.clickRate?.yoy} sub="all flows · deliv-based" accent={ACC} />
        <KpiDelta label="Send Volume" value={fmtCompact(t.recipients || 0)} prior={d.recipients?.prior} yoy={d.recipients?.yoy} sub="total recipients" accent={ACC} />
        <KpiDelta label="Avg RPR" value={fmtRpr(t.rpr || 0, market)} prior={d.rpr?.prior} yoy={d.rpr?.yoy} sub="rev per recipient" accent={ACC} />
      </div>

      {/* STEP VIEW — 3 multi-line charts (Receita / Open Rate / Unsub) por step */}
      {selectedFlowId && stepView === 'STEP' && <>
        <SectionHead pill="Por Step" pillVariant="purple" title={<><b>Performance por step</b> · cada linha = um step do flow ao longo do tempo</>} right={flowSteps ? `${flowSteps.stepCount} steps · ${flowSteps.dates?.length || 0} pontos` : 'Loading...'} />
        {!flowSteps && <div className="loading">Loading steps...</div>}
        {flowSteps && flowSteps.steps.length === 0 && <div className="empty">Sem dados de step para este flow no período selecionado.</div>}
        {flowSteps && flowSteps.steps.length > 0 && (() => {
          const dates: string[] = flowSteps.dates || [];
          // Se time-series está vazia, fallback para bars com totals
          const hasSeries = dates.length > 0 && flowSteps.steps.some((s: any) => (s.revenue || []).length > 0);
          if (!hasSeries) {
            const stepLabels: string[] = flowSteps.steps.map((s: any) => `S${s.stepIndex}`);
            const revSeries = [{ label: 'Receita', values: flowSteps.steps.map((s: any) => s.totals?.revenue || 0) }];
            const orSeries = [{ label: 'OR %', values: flowSteps.steps.map((s: any) => s.totals?.openRate || 0) }];
            return (
              <div className="space-y-4 mt-4">
                <MultiLineChart title="Receita por Step (totais)" dates={stepLabels} series={revSeries} unit="currency" market={market} />
                <MultiLineChart title="Open Rate % por Step (totais)" dates={stepLabels} series={orSeries} unit="percent" market={market} />
              </div>
            );
          }
          // Time-series: cada step = 1 linha
          const revSeries = flowSteps.steps.map((s: any) => ({ label: `S${s.stepIndex} · ${s.name}`, values: s.revenue || [] }));
          const orSeries = flowSteps.steps.map((s: any) => ({ label: `S${s.stepIndex} · ${s.name}`, values: s.openRate || [] }));
          const ctrSeries = flowSteps.steps.map((s: any) => ({ label: `S${s.stepIndex} · ${s.name}`, values: s.clickRate || [] }));
          const unsubSeries = flowSteps.steps.map((s: any) => ({ label: `S${s.stepIndex} · ${s.name}`, values: s.unsubRate || [] }));
          return (
            <>
              <div className="space-y-4 mt-4">
                <MultiLineChart title="Receita por Step ($/semana)" dates={dates} series={revSeries} unit="currency" market={market} />
                <MultiLineChart title="Open Rate % por Step" dates={dates} series={orSeries} unit="percent" market={market} />
                <MultiLineChart title="Click Rate % por Step" dates={dates} series={ctrSeries} unit="percent" market={market} />
                <MultiLineChart title="Unsubscribe % por Step" dates={dates} series={unsubSeries} unit="percent" market={market} />
              </div>

              {/* Tabela com totais por step abaixo dos charts */}
              <SectionHead pill="Totais por Step" pillVariant="teal" title={<><b>Resumo por step</b> · agregado do período</>} />
              <div className="list-card">
                <table className="list-table">
                  <thead><tr>
                    <th>#</th><th>Step / Message</th><th className="num">Recipients</th>
                    <th className="num">OR%</th><th className="num">CTR%</th><th className="num">RPR</th>
                    <th className="num">Conversions</th><th className="num">Revenue</th><th className="num">Unsub%</th>
                  </tr></thead>
                  <tbody>
                    {flowSteps.steps.map((s: any) => (
                      <tr key={s.messageId}>
                        <td><b>S{s.stepIndex}</b></td>
                        <td className="product"><div className="name">{s.name}</div><div className="sku">{s.messageId}</div></td>
                        <td className="num">{fmtInt(s.totals?.recipients || 0)}</td>
                        <td className="num">{fmtPct(s.totals?.openRate || 0)}</td>
                        <td className="num">{fmtPct(s.totals?.clickRate || 0, 2)}</td>
                        <td className="num">{fmtRpr(s.totals?.rpr || 0, market)}</td>
                        <td className="num">{fmtInt(s.totals?.conversions || 0)}</td>
                        <td className="num"><b>{fmtMoney(s.totals?.revenue || 0, market)}</b></td>
                        <td className="num">{fmtPct(s.totals?.unsubRate || 0, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </>}

      {/* FLOW VIEW — charts reativos ao contexto */}
      {(!selectedFlowId || stepView === 'FLOW') && <>
        <SectionHead pill="KPIs Over Time" pillVariant="purple" title={<><b>Performance over time</b> · escopo: {chartScope}</>} right={chartLoading ? 'Loading data...' : `${chartSource.length} pontos`} />
        {chartLoading && <div className="loading">Carregando dados de {chartScope}...</div>}
        {!chartLoading && chartSource.length === 0 && <div className="empty">{bulkSeries?.throttled ? `Klaviyo rate limit ativo. Aguardando ${bulkSeries.loading ? '~30s, retry automático…' : '1min, recarregue.'}` : 'Sem dados de performance para o filtro selecionado.'}</div>}
        {!chartLoading && chartSource.length > 0 && (
          <div className={gridCls}>
            <DailyBarChart title="Flow Revenue" data={flowRevPts} color="#5B3FA0" unit="currency" market={market} />
            <DailyBarChart title="Flow Send Volume" data={flowSendPts} color="#1e3a8a" unit="number" market={market} />
            <DailyBarChart title="Flow Open Rate %" data={flowOrPts} color="#0d9488" unit="percent" market={market} />
            <DailyBarChart title="Flow Click Rate %" data={flowCtrPts} color="#3b82f6" unit="percent" market={market} />
            <DailyBarChart title="Flow RPR" data={flowRprPts} color="#B8861F" unit="rpr" market={market} />
          </div>
        )}
      </>}

      {/* Rankings + Benchmark só na Visão Geral */}
      {category === 'ALL' && <>
        <SectionHead pill="Top Flows" pillVariant="gold" title={<><b>Top flows por métrica</b> · CS excluído · min 500 sends para rankings de rates</>} />
        <TopRankCard title="Top 10 Flows by Revenue" rows={rows} accessor={r => r.revenue} formatter={(v) => fmtMoney(v, market)} color="purple" accentColor="#5B3FA0" />
        <TopRankCard title="Top 10 Flows by Click Rate" rows={eligible} accessor={r => r.clickRate} formatter={(v) => fmtPct(v, 2)} color="blue" accentColor="#3b82f6" />
        <TopRankCard title="Top 10 Flows by Open Rate" rows={eligible} accessor={r => r.openRate} formatter={(v) => fmtPct(v)} color="teal" accentColor="#0d9488" />
        <TopRankCard title="Top 10 Flows by Bounce Rate" rows={eligible} accessor={r => r.bounceRate} formatter={(v) => fmtPct(v, 2)} color="red" accentColor="#B82F2F" />
        <TopRankCard title="Top 10 Flows by Unsubscribe Rate" rows={eligible} accessor={r => r.unsubRate} formatter={(v) => fmtPct(v, 2)} color="orange" accentColor="#E8722A" />

        <SectionHead pill="Benchmark Scorecard" pillVariant="gold" title={<><b>By Flow Type</b> · actual vs Larroudé baseline (p25) and target (p75)</>} right={bm ? `${bm.flows.length} flow types` : ''} />
        {!bm && <div className="loading">Loading benchmarks...</div>}
        {bm && <div className="bm-grid">{bm.flows.map(r => <BenchmarkRowCard key={r.type} r={r} color="purple" />)}</div>}
      </>}

      {/* Live Flows table */}
      <SectionHead pill="Live Flows" pillVariant="purple" title={<><b>{rows.length} live flows</b> · CS excluído · tabela completa</>} />
      <div className="filter-card">
        <div className="filter-group">
          <span className="filter-label">Search</span>
          <input className="search-input" placeholder="nome, tipo (ABANDONED_CHECKOUT, WELCOME...)" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="list-card">
        <table className="list-table">
          <thead><tr>
            <th>Flow</th><th>Trigger</th><th className="num">Recipients</th>
            <th className="num">OR%</th><th className="num">CTR%</th><th className="num">RPR</th>
            <th className="num">Revenue</th><th className="bar">Bar</th><th>Signal</th>
          </tr></thead>
          <tbody>
            {pageRows.map(r => {
              const bmk = FLOW_BENCHMARKS[r.flowType];
              const sig = signalFor(r.openRate, r.clickRate, r.rpr, bmk);
              const kind = sig === 'SCALE' ? 'green' : sig === 'STOP' ? 'red' : sig === 'FIX' ? 'gold' : 'gray';
              return (
                <tr key={r.id} onClick={() => setDrill(r)}>
                  <td className="product">
                    <div className="name">{r.name}</div>
                    <div className="sku">{r.flowType} · {r.id}</div>
                  </td>
                  <td>{r.triggerType}</td>
                  <td className="num">{fmtInt(r.recipients)}</td>
                  <td className="num">{fmtPct(r.openRate)}</td>
                  <td className="num">{fmtPct(r.clickRate, 2)}</td>
                  <td className="num">{fmtRpr(r.rpr, market)}</td>
                  <td className="num"><b>{fmtMoney(r.revenue, market)}</b></td>
                  <td className="bar"><HBar value={r.revenue} max={maxRev} color="purple" label={fmtMoney(r.revenue, market)} /></td>
                  <td><StatusBadge kind={kind as any} label={sig} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} perPage={PER} total={rows.length} onChange={setPage} />
      </div>

      {drill && <Modal title={drill.name} onClose={() => setDrill(null)}>
        <div className="kpi-grid kpi-grid-4">
          <Kpi label="Revenue" value={fmtMoney(drill.revenue, market)} color="purple" />
          <Kpi label="Recipients" value={fmtInt(drill.recipients)} />
          <Kpi label="Open Rate" value={fmtPct(drill.openRate)} />
          <Kpi label="Click Rate" value={fmtPct(drill.clickRate, 2)} />
          <Kpi label="RPR" value={fmtRpr(drill.rpr, market)} />
          <Kpi label="Conversions" value={fmtInt(drill.conversions)} />
          <Kpi label="Bounce%" value={fmtPct(drill.bounceRate, 2)} color={drill.bounceRate > 0.5 ? 'red' : undefined} />
          <Kpi label="Unsub%" value={fmtPct(drill.unsubRate, 2)} color={drill.unsubRate > 1 ? 'red' : undefined} />
        </div>
      </Modal>}
    </>
  );
}

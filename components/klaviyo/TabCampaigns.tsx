'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, HBar, StatusBadge, Pagination, Modal, fmtMoney, fmtMoneyCents, fmtInt, fmtPct, fmtDate } from './ui';
import DailyBarChart from './DailyBarChart';
import { KpiDelta, fmtCompact } from './KpiDelta';
import { CAMPAIGN_BENCHMARKS, signalFor } from '@/lib/klaviyo/classify';
import type { Market, Period, CustomRange, CampaignRow, BenchmarkRow } from '@/types/klaviyo/models';

const PER = 30;
const TOP = 10;

function TopRankCard({ title, rows, accessor, formatter, color, accentColor }: {
  title: string;
  rows: CampaignRow[];
  accessor: (r: CampaignRow) => number;
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
        <thead><tr><th>#</th><th>Campaign</th><th>Type</th><th className="bar">Value</th><th className="num">Metric</th></tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id}>
              <td><b>{i + 1}</b></td>
              <td className="product"><div className="name">{r.name}</div><div className="sku">{fmtDate(r.sendDate)}</div></td>
              <td><StatusBadge kind="teal" label={r.type} /></td>
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
  const dOR = r.orPct - r.orBaseline;
  const dCTR = r.ctrPct - r.ctrBaseline;
  const dRPR = r.rpr - r.rprBaseline;
  return (
    <div className="bm-card" key={r.type}>
      <h4>{r.type} <span style={{ color: 'var(--ink-3)', fontWeight: 500, fontSize: 12, marginLeft: 6 }}>&middot; {r.count} sends</span> <span style={{ float: 'right' }}><StatusBadge kind={sigKind as any} label={r.signal} /></span></h4>
      <div className="bm-row">
        <div className="bm-label">OR%</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (r.orPct/r.orTarget)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtPct(r.orPct)}</div>
        <div className="bm-bench">b: {fmtPct(r.orBaseline)} &middot; t: {fmtPct(r.orTarget)} &middot; <span style={{ color: dOR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dOR >= 0 ? '+' : ''}{dOR.toFixed(1)}</span></div>
      </div>
      <div className="bm-row">
        <div className="bm-label">CTR%</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (r.ctrPct/r.ctrTarget)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtPct(r.ctrPct, 2)}</div>
        <div className="bm-bench">b: {fmtPct(r.ctrBaseline, 2)} &middot; t: {fmtPct(r.ctrTarget, 2)} &middot; <span style={{ color: dCTR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dCTR >= 0 ? '+' : ''}{dCTR.toFixed(2)}</span></div>
      </div>
      <div className="bm-row">
        <div className="bm-label">RPR</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (r.rpr/r.rprTarget)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtMoneyCents(r.rpr)}</div>
        <div className="bm-bench">b: {fmtMoneyCents(r.rprBaseline)} &middot; t: {fmtMoneyCents(r.rprTarget)} &middot; <span style={{ color: dRPR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dRPR >= 0 ? '+' : ''}${dRPR.toFixed(2)}</span></div>
      </div>
    </div>
  );
}

export default function TabCampaigns({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<{ rows: CampaignRow[]; series?: any[]; granularity?: string; totals?: any; delta?: any } | null>(null);
  const [bm, setBm] = useState<{ campaigns: BenchmarkRow[]; flows: BenchmarkRow[] } | null>(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drill, setDrill] = useState<CampaignRow | null>(null);

  useEffect(() => {
    setData(null); setBm(null); setErr(''); setPage(1);
    api('campaigns', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
    api('benchmarks', market, period, custom).then(setBm).catch(() => {});
  }, [market, period, custom?.start, custom?.end]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.rows.filter(r => !q || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q));
  }, [data, search]);

  useEffect(() => { setPage(1); }, [search]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading campaigns ({market} / {period})...</div>;

  const maxRev = Math.max(...rows.map(r => r.revenue), 1);
  const pageRows = rows.slice((page-1)*PER, page*PER);

  const series = (data.series || []) as any[];
  const revPts = series.map(p => ({ date: p.date, value: p.revenue, inPeriod: true }));
  const sendPts = series.map(p => ({ date: p.date, value: p.recipients, inPeriod: true }));
  const orPts = series.map(p => ({ date: p.date, value: p.openRate, inPeriod: true }));
  const ctrPts = series.map(p => ({ date: p.date, value: p.clickRate, inPeriod: true }));
  const rprPts = series.map(p => ({ date: p.date, value: p.rpr, inPeriod: true }));
  const gridCls = 'space-y-4 mt-4';

  const t = data.totals || {};
  const d = data.delta || {};
  const convRate = t.recipients ? (t.conversions / t.recipients) * 100 : 0;
  const ACC = '#E91E78';

  // Volume mÃ­nimo para rankings de rates (>=500 sends) â€” evita campanhas pequenas no top
  const eligible = data.rows.filter(r => r.recipients >= 500);

  return (
    <>
      <SectionHead pill="Campaigns KPIs" pillVariant="pink" title={<><b>Period summary</b> &middot; deltas vs prior period and YoY</>} right={`${data.rows.length} campaigns`} />
      <div className="kpi-grid kpi-grid-8" style={{ marginBottom: 20 }}>
        <KpiDelta label="Campaign Revenue" value={(market === 'BR' ? 'R$' : '$') + fmtCompact(t.revenue || 0)} prior={d.revenue?.prior} yoy={d.revenue?.yoy} sub={`${data.rows.length} campaigns · RPR ${market === 'BR' ? 'R$' : '$'}${(t.rpr || 0).toFixed(4)}`} accent={ACC} />
        <KpiDelta label="Conversions" value={fmtCompact(t.conversions || 0)} prior={d.conversions?.prior} yoy={d.conversions?.yoy} sub={`Conv. rate ${convRate.toFixed(3)}%`} accent={ACC} />
        <KpiDelta label="Total Clicks" value={fmtCompact(t.clicks || 0)} prior={d.clicks?.prior} yoy={d.clicks?.yoy} sub="unique clicks" accent={ACC} />
        <KpiDelta label="Open Rate" value={fmtPct(t.openRate || 0)} prior={d.openRate?.prior} yoy={d.openRate?.yoy} sub="all sends Â· deliv-based" accent={ACC} />
        <KpiDelta label="Click Rate (CTR)" value={fmtPct(t.clickRate || 0, 2)} prior={d.clickRate?.prior} yoy={d.clickRate?.yoy} sub="all sends Â· deliv-based" accent={ACC} />
        <KpiDelta label="Send Volume" value={fmtCompact(t.recipients || 0)} prior={d.recipients?.prior} yoy={d.recipients?.yoy} sub="total recipients" accent={ACC} />
        <KpiDelta label="Avg RPR" value={(market === 'BR' ? 'R$' : '$') + (t.rpr || 0).toFixed(4)} prior={d.rpr?.prior} yoy={d.rpr?.yoy} sub="rev per recipient" accent={ACC} />
      </div>

      {series.length > 0 && <>
        <SectionHead pill="Daily Trend" pillVariant="pink" title={<><b>Revenue, sends and engagement</b> &middot; {data.granularity === 'week' ? 'weekly' : 'daily'}</>} />
        <div className={gridCls}>
          <DailyBarChart title="Daily Campaign Revenue" data={revPts} color="#ec4899" unit="currency" market={market} />
          <DailyBarChart title="Daily Send Volume" data={sendPts} color="#1e3a8a" unit="number" market={market} />
          <DailyBarChart title="Open Rate %" data={orPts} color="#0d9488" unit="percent" market={market} />
          <DailyBarChart title="Click Rate %" data={ctrPts} color="#3b82f6" unit="percent" market={market} />
          <DailyBarChart title="RPR ($)" data={rprPts} color="#B8861F" unit="currency" market={market} />
        </div>
      </>}

      {/* Top Campaigns rankings */}
      <SectionHead pill="Top Campaigns" pillVariant="gold" title={<><b>Top campaigns by metric</b> &middot; min 500 sends for rate rankings</>} />
      <TopRankCard title="Top 10 Campaigns by Revenue" rows={data.rows} accessor={r => r.revenue} formatter={fmtMoney} color="pink" accentColor="#E91E78" />
      <TopRankCard title="Top 10 Campaigns by Click Rate" rows={eligible} accessor={r => r.clickRate} formatter={v => fmtPct(v, 2)} color="blue" accentColor="#3b82f6" />
      <TopRankCard title="Top 10 Campaigns by Open Rate" rows={eligible} accessor={r => r.openRate} formatter={v => fmtPct(v)} color="teal" accentColor="#0d9488" />
      <TopRankCard title="Top 10 Campaigns by Bounce Rate" rows={eligible} accessor={r => r.bounceRate} formatter={v => fmtPct(v, 2)} color="red" accentColor="#B82F2F" />
      <TopRankCard title="Top 10 Campaigns by Unsubscribe Rate" rows={eligible} accessor={r => r.unsubRate} formatter={v => fmtPct(v, 2)} color="orange" accentColor="#E8722A" />

      {/* Benchmark Scorecard by Campaign Type */}
      <SectionHead pill="Benchmark Scorecard" pillVariant="gold" title={<><b>By Campaign Type</b> &middot; actual vs LarroudÃ© baseline (p25) and target (p75)</>} right={bm ? `${bm.campaigns.length} camp types` : ''} />
      {!bm && <div className="loading">Loading benchmarks...</div>}
      {bm && <div className="bm-grid">{bm.campaigns.map(r => <BenchmarkRowCard key={r.type} r={r} color="pink" />)}</div>}

      <SectionHead pill="Campaigns" pillVariant="pink" title={<><b>{data.rows.length} campaigns</b> sent in period &middot; full table</>} right={`${rows.length} after filters`} />
      <div className="filter-card">
        <div className="filter-group">
          <span className="filter-label">Search</span>
          <input className="search-input" placeholder="name, type (MARKDOWN, VIP, FLASH...)" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="list-card">
        <table className="list-table">
          <thead><tr>
            <th>Campaign</th>
            <th>Date</th>
            <th className="num">Recipients</th>
            <th className="num">OR%</th>
            <th className="num">CTR%</th>
            <th className="num">RPR</th>
            <th className="num">Revenue</th>
            <th className="bar">Bar</th>
            <th>Signal</th>
          </tr></thead>
          <tbody>
            {pageRows.map(r => {
              const bmk = CAMPAIGN_BENCHMARKS[r.type];
              const sig = signalFor(r.openRate, r.clickRate, r.rpr, bmk);
              const kind = sig === 'SCALE' ? 'green' : sig === 'STOP' ? 'red' : sig === 'FIX' ? 'gold' : 'gray';
              return (
                <tr key={r.id} onClick={() => setDrill(r)}>
                  <td className="product">
                    <div className="name">{r.name}</div>
                    <div className="sku">{r.type} &middot; {r.id}</div>
                  </td>
                  <td>{fmtDate(r.sendDate)}</td>
                  <td className="num">{fmtInt(r.recipients)}</td>
                  <td className="num">{fmtPct(r.openRate)}</td>
                  <td className="num">{fmtPct(r.clickRate, 2)}</td>
                  <td className="num">{fmtMoneyCents(r.rpr, market)}</td>
                  <td className="num"><b>{fmtMoney(r.revenue, market)}</b></td>
                  <td className="bar"><HBar value={r.revenue} max={maxRev} color="pink" label={fmtMoney(r.revenue, market)} /></td>
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
          <Kpi label="Revenue" value={fmtMoney(drill.revenue, market)} color="pink" />
          <Kpi label="Recipients" value={fmtInt(drill.recipients)} />
          <Kpi label="Open Rate" value={fmtPct(drill.openRate)} />
          <Kpi label="Click Rate" value={fmtPct(drill.clickRate, 2)} />
          <Kpi label="RPR" value={fmtMoneyCents(drill.rpr, market)} />
          <Kpi label="Conversions" value={fmtInt(drill.conversions)} />
          <Kpi label="Bounce%" value={fmtPct(drill.bounceRate, 2)} color={drill.bounceRate > 0.5 ? 'red' : undefined} />
          <Kpi label="Unsub%" value={fmtPct(drill.unsubRate, 2)} color={drill.unsubRate > 0.5 ? 'red' : undefined} />
        </div>
      </Modal>}
    </>
  );
}
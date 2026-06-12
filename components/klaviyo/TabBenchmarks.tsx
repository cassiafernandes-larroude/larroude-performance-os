'use client';
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { SectionHead, StatusBadge, fmtPct, fmtMoneyCents } from './ui';
import type { Market, Period, CustomRange, BenchmarkRow } from '@/types/klaviyo/models';

const n = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function row(r: BenchmarkRow, color: string) {
  if (!r || !r.type) return null;
  const sigKind = r.signal === 'SCALE' ? 'green' : r.signal === 'STOP' ? 'red' : r.signal === 'FIX' ? 'gold' : 'gray';
  const orPct = n(r.orPct), orBase = n(r.orBaseline), orT = n(r.orTarget) || 1;
  const ctrPct = n(r.ctrPct), ctrBase = n(r.ctrBaseline), ctrT = n(r.ctrTarget) || 1;
  const rpr = n(r.rpr), rprBase = n(r.rprBaseline), rprT = n(r.rprTarget) || 1;
  const dOR = orPct - orBase;
  const dCTR = ctrPct - ctrBase;
  const dRPR = rpr - rprBase;
  return (
    <div className="bm-card" key={r.type}>
      <h4>{r.type} <span style={{ color: 'var(--ink-3)', fontWeight: 500, fontSize: 12, marginLeft: 6 }}>&middot; {n(r.count)} sends</span> <span style={{ float: 'right' }}><StatusBadge kind={sigKind as any} label={r.signal || 'MIXED'} /></span></h4>
      <div className="bm-row">
        <div className="bm-label">OR%</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (orPct/orT)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtPct(orPct)}</div>
        <div className="bm-bench">b: {fmtPct(orBase)} &middot; t: {fmtPct(n(r.orTarget))} &middot; <span style={{ color: dOR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dOR >= 0 ? '+' : ''}{dOR.toFixed(1)}</span></div>
      </div>
      <div className="bm-row">
        <div className="bm-label">CTR%</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (ctrPct/ctrT)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtPct(ctrPct, 2)}</div>
        <div className="bm-bench">b: {fmtPct(ctrBase, 2)} &middot; t: {fmtPct(n(r.ctrTarget), 2)} &middot; <span style={{ color: dCTR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dCTR >= 0 ? '+' : ''}{dCTR.toFixed(2)}</span></div>
      </div>
      <div className="bm-row">
        <div className="bm-label">RPR</div>
        <div><div className="bar-track" style={{ height: 6 }}><div className={`bar-fill b-${color}`} style={{ width: Math.min(100, (rpr/rprT)*100) + '%' }} /></div></div>
        <div className="bm-val">{fmtMoneyCents(rpr)}</div>
        <div className="bm-bench">b: {fmtMoneyCents(rprBase)} &middot; t: {fmtMoneyCents(n(r.rprTarget))} &middot; <span style={{ color: dRPR >= 0 ? 'var(--green)' : 'var(--red)' }}>{dRPR >= 0 ? '+' : ''}${dRPR.toFixed(2)}</span></div>
      </div>
    </div>
  );
}

export default function TabBenchmarks({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<{ campaigns: BenchmarkRow[]; flows: BenchmarkRow[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null); setErr('');
    api('benchmarks', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading benchmarks...</div>;

  const camps = (data.campaigns || []).filter(r => r && r.type);
  const flows = (data.flows || []).filter(r => r && r.type);

  return (
    <>
      <SectionHead pill="Benchmarks" pillVariant="gold" title={<><b>Scorecard by type</b> &middot; actual vs LarroudÃ© baseline (p25) and target (p75)</>} right={`${camps.length} camp types / ${flows.length} flow types`} />

      <SectionHead pill="Campaigns" pillVariant="pink" title={<><b>By type</b></>} />
      <div className="bm-grid">{camps.map(r => row(r, 'pink'))}</div>

      <SectionHead pill="Flows" pillVariant="purple" title={<><b>By type</b></>} />
      <div className="bm-grid">{flows.map(r => row(r, 'purple'))}</div>

      <SectionHead pill="Framework" pillVariant="teal" title={<><b>SCALE / FIX / STOP</b> &middot; how to act</>} />
      <div className="insight-grid">
        <div className="insight-card green"><h3>SCALE</h3><p style={{ fontSize: 13, color: 'var(--ink-2)' }}>2+ metrics above target &rarr; increase frequency, expand segment, or replicate to other products.</p></div>
        <div className="insight-card blue"><h3>FIX / MONITOR</h3><p style={{ fontSize: 13, color: 'var(--ink-2)' }}>1 metric below baseline: low OR = subject/timing &middot; low CTR = creative/CTA &middot; low CVR = LP/offer &middot; low RPR = AOV.</p></div>
        <div className="insight-card red"><h3>STOP</h3><p style={{ fontSize: 13, color: 'var(--ink-2)' }}>2+ consecutive sends below baseline after fix &rarr; archive format and document learning.</p></div>
      </div>
    </>
  );
}

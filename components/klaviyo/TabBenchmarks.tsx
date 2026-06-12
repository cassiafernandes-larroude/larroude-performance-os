'use client';

import { useEffect, useState } from 'react';
import type { Market, Period } from '@/lib/klaviyo/types';
import { buildKlaviyoUrl, fmtMoney, fmtPct } from './fetcher';

/**
 * Benchmarks Larroude p25/p75 + framework SCALE/FIX/STOP.
 * Calculados sobre dados reais Klaviyo jan-abr/2026 (REPLICATION-GUIDE Section 8).
 */

interface Props {
  market: Market;
  period: Period;
  customRange?: { from: string; to: string };
}

const CAMP_BENCHMARKS: Record<string, { or: [number, number]; ctr: [number, number]; rpr: [number, number] }> = {
  MARKDOWN:  { or: [0.60, 0.65], ctr: [0.005, 0.013], rpr: [0.10, 0.18] },
  FLASH:     { or: [0.58, 0.63], ctr: [0.0028, 0.0055], rpr: [0.06, 0.08] },
  PREORDER:  { or: [0.61, 0.67], ctr: [0.0032, 0.0082], rpr: [0.05, 0.11] },
  FULLPRICE: { or: [0.63, 0.70], ctr: [0.0032, 0.0080], rpr: [0.03, 0.08] },
  VIP:       { or: [0.52, 0.59], ctr: [0.012, 0.020], rpr: [0.32, 0.50] },
};

const FLOW_BENCHMARKS: Record<string, { or: [number, number]; ctr: [number, number]; rpr: [number, number] }> = {
  ABANDONED_CHECKOUT: { or: [0.57, 0.63], ctr: [0.024, 0.050], rpr: [3.80, 8.00] },
  BROWSE_ABANDON:     { or: [0.44, 0.47], ctr: [0.011, 0.018], rpr: [0.22, 0.34] },
  WELCOME:            { or: [0.45, 0.55], ctr: [0.006, 0.010], rpr: [0.13, 0.25] },
  PRICE_DROP:         { or: [0.33, 0.48], ctr: [0.020, 0.050], rpr: [0.43, 1.00] },
  POST_PURCHASE:      { or: [0.52, 0.56], ctr: [0.008, 0.015], rpr: [0.10, 0.30] },
};

type Score = 'SCALE' | 'OK' | 'FIX' | 'STOP';

function scoreMetric(actual: number, bench: [number, number]): 'above' | 'within' | 'below' {
  if (actual >= bench[1]) return 'above';
  if (actual < bench[0]) return 'below';
  return 'within';
}

function overallScore(metrics: ('above' | 'within' | 'below')[]): Score {
  const above = metrics.filter((m) => m === 'above').length;
  const below = metrics.filter((m) => m === 'below').length;
  if (above >= 2) return 'SCALE';
  if (below >= 2) return 'STOP';
  if (below === 1) return 'FIX';
  return 'OK';
}

export default function TabBenchmarks({ market, period, customRange }: Props) {
  const [camps, setCamps] = useState<any[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(buildKlaviyoUrl('campaigns', market, period, customRange)).then((r) => r.json()),
      fetch(buildKlaviyoUrl('flows', market, period, customRange)).then((r) => r.json()),
    ]).then(([c, f]) => {
      if (cancelled) return;
      setCamps(c.rows || []);
      setFlows(f.rows || []);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [market, period, customRange?.from, customRange?.to]);

  if (loading) return <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Loading benchmarks…</div>;

  // Aggregate por type
  const campByType = aggByKey(camps, 'type');
  const flowByType = aggByKey(flows, 'flowType');

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
          Campaign Benchmarks (Larroudé p25/p75 baseline)
        </div>
        <BenchmarkTable rows={campByType} benchmarks={CAMP_BENCHMARKS} market={market} />
      </section>

      <section className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
          Flow Benchmarks (Larroudé p25/p75 baseline)
        </div>
        <BenchmarkTable rows={flowByType} benchmarks={FLOW_BENCHMARKS} market={market} />
      </section>

      <div className="card p-4 text-[11px]" style={{ color: '#6b7280', background: '#fff7e0', border: '1px solid #f3e7c4' }}>
        <strong>Framework:</strong> SCALE = 2+ métricas acima do target · OK = todas dentro · FIX = 1 abaixo do baseline · STOP = 2+ abaixo do baseline
      </div>
    </div>
  );
}

function aggByKey(rows: any[], key: string) {
  const m = new Map<string, any>();
  for (const r of rows) {
    const k = r[key];
    if (!k) continue;
    const ex = m.get(k) || { type: k, recipients: 0, delivered: 0, opens: 0, clicks: 0, revenue: 0 };
    ex.recipients += r.recipients || 0;
    ex.delivered += r.delivered || 0;
    ex.opens += r.opens || 0;
    ex.clicks += r.clicks || 0;
    ex.revenue += r.revenue || 0;
    m.set(k, ex);
  }
  return Array.from(m.values()).map((x) => ({
    ...x,
    openRate: x.delivered > 0 ? x.opens / x.delivered : 0,
    clickRate: x.delivered > 0 ? x.clicks / x.delivered : 0,
    revenuePerRecipient: x.recipients > 0 ? x.revenue / x.recipients : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

function BenchmarkTable({ rows, benchmarks, market }: { rows: any[]; benchmarks: Record<string, any>; market: Market }) {
  if (!rows.length) return <div className="text-[12px]" style={{ color: '#9ca3af' }}>No data.</div>;
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10px] uppercase font-bold text-steel tracking-wide">
          <th className="py-2">Type</th>
          <th className="py-2 text-right">OR</th>
          <th className="py-2 text-right">CTR</th>
          <th className="py-2 text-right">RPR</th>
          <th className="py-2 text-right">Revenue</th>
          <th className="py-2 text-center">Verdict</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const b = benchmarks[r.type];
          if (!b) return null;
          const orScore = scoreMetric(r.openRate, b.or);
          const ctrScore = scoreMetric(r.clickRate, b.ctr);
          const rprScore = scoreMetric(r.revenuePerRecipient, b.rpr);
          const verdict = overallScore([orScore, ctrScore, rprScore]);
          const verdictColors: Record<Score, { bg: string; text: string }> = {
            SCALE: { bg: '#ecf6f0', text: '#1d5b41' },
            OK: { bg: '#f5f3ee', text: '#4a4a4a' },
            FIX: { bg: '#fff7e0', text: '#8a5b18' },
            STOP: { bg: '#fff5f5', text: '#7a221c' },
          };
          const c = verdictColors[verdict];
          return (
            <tr key={r.type} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
              <td className="py-2 font-semibold">{r.type}</td>
              <td className="py-2 text-right font-num">
                <Score val={fmtPct(r.openRate, 1)} status={orScore} />
              </td>
              <td className="py-2 text-right font-num">
                <Score val={fmtPct(r.clickRate, 2)} status={ctrScore} />
              </td>
              <td className="py-2 text-right font-num">
                <Score val={fmtMoney(r.revenuePerRecipient, market)} status={rprScore} />
              </td>
              <td className="py-2 text-right font-num font-semibold">{fmtMoney(r.revenue, market, true)}</td>
              <td className="py-2 text-center">
                <span style={{ background: c.bg, color: c.text, fontWeight: 700, fontSize: 10, padding: '3px 8px', borderRadius: 6 }}>
                  {verdict}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Score({ val, status }: { val: string; status: 'above' | 'within' | 'below' }) {
  const colors = {
    above: '#1d5b41',
    within: '#1a1a1a',
    below: '#7a221c',
  }[status];
  return <span style={{ color: colors, fontWeight: status === 'within' ? 500 : 700 }}>{val}</span>;
}

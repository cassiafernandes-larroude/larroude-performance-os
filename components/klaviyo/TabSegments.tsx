'use client';

import { useEffect, useState } from 'react';
import type { Market } from '@/lib/klaviyo/types';
import { fmtNumber } from './fetcher';

interface Props { market: Market; }

export default function TabSegments({ market }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/klaviyo/segments/${market}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [market]);

  if (loading) return <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Loading segments…</div>;
  if (error) return <div className="card p-4" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}>{error}</div>;
  if (!data) return null;

  const rows = data.rows || [];
  return (
    <section className="card overflow-x-auto">
      <div className="px-5 pt-5 text-xs font-bold uppercase tracking-wider" style={{ color: '#6b7280' }}>
        All Segments ({rows.length}) — {market}
      </div>
      <table className="w-full text-[12px] mt-3">
        <thead>
          <tr className="text-left text-[10px] uppercase font-bold text-steel tracking-wide border-b" style={{ borderColor: 'var(--border)' }}>
            <th className="px-3 py-2.5">#</th>
            <th className="px-3 py-2.5">Segment</th>
            <th className="px-3 py-2.5 text-right">Profiles</th>
            <th className="px-3 py-2.5">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
              <td className="px-3 py-2 text-[10px]" style={{ color: '#9ca3af' }}>{i + 1}</td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-right font-num font-semibold">{fmtNumber(r.profileCount, market)}</td>
              <td className="px-3 py-2 text-[11px]" style={{ color: '#6b7280' }}>{r.created?.slice(0, 10) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

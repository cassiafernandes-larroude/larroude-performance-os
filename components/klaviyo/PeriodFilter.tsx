'use client';

import { useState, useEffect } from 'react';
import type { Period } from '@/lib/klaviyo/types';

interface Props {
  value: Period;
  customRange?: { from: string; to: string };
  onChange: (p: Period, custom?: { from: string; to: string }) => void;
}

const PRESETS: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

const PILL_BASE =
  'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const PILL_ACTIVE = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-5 py-1.5 sm:py-2`;

function ymdAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function PeriodFilter({ value, customRange, onChange }: Props) {
  const [draftStart, setDraftStart] = useState(customRange?.from || ymdAgo(28));
  const [draftEnd, setDraftEnd] = useState(customRange?.to || ymdAgo(1));
  const isCustom = value === 'custom';

  useEffect(() => {
    if (customRange) {
      setDraftStart(customRange.from);
      setDraftEnd(customRange.to);
    }
  }, [customRange?.from, customRange?.to]);

  const apply = () => {
    if (!draftStart || !draftEnd) return alert('Select start and end date.');
    if (draftStart > draftEnd) return alert('Start must be before end.');
    onChange('custom', { from: draftStart, to: draftEnd });
  };

  return (
    <div
      className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3"
      style={{ background: 'white', border: '0.8px solid #e5e3de' }}
    >
      <span className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1" style={{ color: '#9ca3af' }}>
        Period
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={value === p ? PILL_ACTIVE : PILL_INACTIVE}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="h-7 w-px mx-1" style={{ background: '#e5e3de' }} />
      <input
        type="date"
        value={draftStart}
        onChange={(e) => setDraftStart(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
        className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
        style={{ border: `1px solid ${isCustom ? '#d97757' : '#e5e3de'}` }}
      />
      <span className="text-[13px]" style={{ color: '#6b7280' }}>to</span>
      <input
        type="date"
        value={draftEnd}
        onChange={(e) => setDraftEnd(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
        className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
        style={{ border: `1px solid ${isCustom ? '#d97757' : '#e5e3de'}` }}
      />
      <button onClick={apply} className={PILL_ACTIVE} title="Apply date range">
        Apply
      </button>
    </div>
  );
}

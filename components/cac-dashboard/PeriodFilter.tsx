'use client';

import { useEffect, useState } from 'react';

export type Preset = '7d' | '14d' | '28d' | '3M' | '6M' | '12M' | 'custom';

export interface PeriodState {
  preset: Preset;
  start: string;
  end: string;
}

function isoDaysAgo(days: number, ref: Date = new Date()): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysFor(preset: Exclude<Preset, 'custom'>): number {
  switch (preset) {
    case '7d': return 7;
    case '14d': return 14;
    case '28d': return 28;
    case '3M': return 90;
    case '6M': return 180;
    case '12M': return 365;
  }
}

function presetLabel(state: PeriodState): string {
  if (state.preset === 'custom') {
    const days = Math.max(
      1,
      Math.round(
        (new Date(state.end + 'T12:00:00').getTime() -
          new Date(state.start + 'T12:00:00').getTime()) /
          86400000
      ) + 1
    );
    return `Last ${days} day${days === 1 ? '' : 's'}`;
  }
  const map: Record<Exclude<Preset, 'custom'>, string> = {
    '7d': 'Last 7 days',
    '14d': 'Last 14 days',
    '28d': 'Last 28 days',
    '3M': 'Last 3 months',
    '6M': 'Last 6 months',
    '12M': 'Last 12 months',
  };
  return map[state.preset];
}

export function presetRange(preset: Exclude<Preset, 'custom'>, refDate: string): PeriodState {
  const ref = new Date(refDate + 'T12:00:00');
  return {
    preset,
    start: isoDaysAgo(daysFor(preset) - 1, ref),
    end: refDate,
  };
}

const PRESETS: Exclude<Preset, 'custom'>[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

// Pill styles — EXACTLY MATCH Main Dashboard Header
const PILL_BASE = 'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const PILL_ACTIVE_DARK = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-5 py-1.5 sm:py-2`;

export default function PeriodFilter({
  value,
  onChange,
  maxDate,
}: {
  value: PeriodState;
  onChange: (s: PeriodState) => void;
  maxDate: string;
}) {
  const [draftStart, setDraftStart] = useState(value.start);
  const [draftEnd, setDraftEnd] = useState(value.end);

  useEffect(() => {
    setDraftStart(value.start);
    setDraftEnd(value.end);
  }, [value.start, value.end]);

  useEffect(() => {
    if (value.end > maxDate) {
      onChange({ ...value, end: maxDate });
    }
  }, [maxDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPreset = (p: Exclude<Preset, 'custom'>) => onChange(presetRange(p, maxDate));
  const isCustom = value.preset === 'custom';

  function applyDates() {
    if (!draftStart || !draftEnd) {
      alert('Select a start and end date.');
      return;
    }
    if (draftStart > draftEnd) {
      alert('Start date must be before or equal to end date.');
      return;
    }
    onChange({ preset: 'custom', start: draftStart, end: draftEnd });
  }

  return (
    <div
      className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 no-print mb-5"
      style={{ background: 'white', border: '0.8px solid #e5e3de' }}
    >
      <span
        className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1"
        style={{ color: '#9ca3af' }}
      >
        Period
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => {
          const active = value.preset === p;
          return (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={active ? PILL_ACTIVE_DARK : PILL_INACTIVE}
            >
              {p.toUpperCase()}
            </button>
          );
        })}
      </div>

      <div className="h-7 w-px mx-1" style={{ background: '#e5e3de' }} />

      <input
        type="date"
        value={draftStart}
        onChange={(e) => setDraftStart(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') applyDates();
        }}
        className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
        style={{
          border: `1px solid ${isCustom ? '#d97757' : '#e5e3de'}`,
          boxShadow: isCustom ? '0 0 0 1px rgba(217,119,87,0.30)' : 'none',
        }}
      />
      <span className="text-[13px]" style={{ color: '#6b7280' }}>to</span>
      <input
        type="date"
        value={draftEnd}
        max={maxDate}
        onChange={(e) => setDraftEnd(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') applyDates();
        }}
        className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
        style={{
          border: `1px solid ${isCustom ? '#d97757' : '#e5e3de'}`,
          boxShadow: isCustom ? '0 0 0 1px rgba(217,119,87,0.30)' : 'none',
        }}
      />
      <button
        onClick={applyDates}
        className={PILL_ACTIVE_DARK}
        title="Apply date range"
      >
        Apply
      </button>

      <span className="ml-auto text-[13px] italic px-2" style={{ color: '#9ca3af' }}>
        {presetLabel(value)}
      </span>
    </div>
  );
}

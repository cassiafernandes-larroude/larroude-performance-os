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

export default function PeriodFilter({
  value,
  onChange,
  maxDate,
}: {
  value: PeriodState;
  onChange: (s: PeriodState) => void;
  maxDate: string;
}) {
  // Draft state — só aplica no Apply
  const [draftStart, setDraftStart] = useState(value.start);
  const [draftEnd, setDraftEnd] = useState(value.end);

  // Sincroniza draft quando o valor externo muda (ex: usuário clica preset)
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
    <div className="period-bar" role="group" aria-label="Period filter">
      <span className="period-label">Period</span>
      {PRESETS.map((p) => (
        <button
          key={p}
          className={`period-btn ${value.preset === p ? 'active' : ''}`}
          onClick={() => setPreset(p)}
        >
          {p.toUpperCase()}
        </button>
      ))}
      <span className="divider" />
      <input
        type="date"
        className="date-input"
        value={draftStart}
        max={draftEnd || maxDate}
        onChange={(e) => setDraftStart(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') applyDates();
        }}
        aria-label="Start date"
      />
      <span style={{ color: '#8a8a8a', fontSize: 12 }}>to</span>
      <input
        type="date"
        className="date-input"
        value={draftEnd}
        min={draftStart}
        max={maxDate}
        onChange={(e) => setDraftEnd(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') applyDates();
        }}
        aria-label="End date"
      />
      <button
        className="period-btn apply-btn"
        onClick={applyDates}
        aria-label="Apply date range"
      >
        Apply
      </button>
      <span className="period-desc">{presetLabel(value)}</span>
    </div>
  );
}

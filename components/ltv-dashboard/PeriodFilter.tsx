'use client';

import { useEffect } from 'react';

export type Preset = '3M' | '6M' | '12M' | 'custom';

export interface PeriodState {
  preset: Preset;
  start: string;
  end: string;
}

function isoMonthsAgo(months: number, ref: Date = new Date()): string {
  const d = new Date(ref);
  d.setMonth(d.getMonth() - months);
  // Push start by 1 day so the window is inclusive
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function presetRange(preset: Exclude<Preset, 'custom'>, refDate: string): PeriodState {
  const ref = new Date(refDate + 'T12:00:00');
  const months = preset === '3M' ? 3 : preset === '6M' ? 6 : 12;
  return {
    preset,
    start: isoMonthsAgo(months, ref),
    end: refDate,
  };
}

export default function PeriodFilter({
  value,
  onChange,
  maxDate,
}: {
  value: PeriodState;
  onChange: (s: PeriodState) => void;
  maxDate: string;
}) {
  // Keep end date capped at maxDate
  useEffect(() => {
    if (value.end > maxDate) {
      onChange({ ...value, end: maxDate });
    }
  }, [maxDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPreset = (p: Exclude<Preset, 'custom'>) => onChange(presetRange(p, maxDate));

  return (
    <div className="period-bar" role="group" aria-label="Period filter">
      <span className="period-label">Period</span>
      <button
        className={`period-btn ${value.preset === '3M' ? 'active' : ''}`}
        onClick={() => setPreset('3M')}
      >
        3M
      </button>
      <button
        className={`period-btn ${value.preset === '6M' ? 'active' : ''}`}
        onClick={() => setPreset('6M')}
      >
        6M
      </button>
      <button
        className={`period-btn ${value.preset === '12M' ? 'active' : ''}`}
        onClick={() => setPreset('12M')}
      >
        12M
      </button>
      <span className="divider" />
      <input
        type="date"
        className="date-input"
        value={value.start}
        max={value.end}
        onChange={(e) => onChange({ preset: 'custom', start: e.target.value, end: value.end })}
        aria-label="Start date"
      />
      <span style={{ color: '#8a8a8a', fontSize: 12 }}>to</span>
      <input
        type="date"
        className="date-input"
        value={value.end}
        min={value.start}
        max={maxDate}
        onChange={(e) => onChange({ preset: 'custom', start: value.start, end: e.target.value })}
        aria-label="End date"
      />
      <span className="period-desc">
        {value.preset === 'custom'
          ? 'Custom period'
          : value.preset === '3M'
          ? 'Last 3 months'
          : value.preset === '6M'
          ? 'Last 6 months'
          : 'Last 12 months (rolling)'}
      </span>
    </div>
  );
}

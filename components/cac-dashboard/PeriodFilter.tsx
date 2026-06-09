'use client';

import { useEffect } from 'react';

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

function presetLabel(preset: Preset): string {
  if (preset === 'custom') return 'Período customizado';
  const map: Record<Exclude<Preset, 'custom'>, string> = {
    '7d': 'Últimos 7 dias',
    '14d': 'Últimos 14 dias',
    '28d': 'Últimos 28 dias',
    '3M': 'Últimos 3 meses',
    '6M': 'Últimos 6 meses',
    '12M': 'Últimos 12 meses',
  };
  return map[preset];
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
  useEffect(() => {
    if (value.end > maxDate) {
      onChange({ ...value, end: maxDate });
    }
  }, [maxDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPreset = (p: Exclude<Preset, 'custom'>) => onChange(presetRange(p, maxDate));

  return (
    <div className="period-bar" role="group" aria-label="Filtro de período">
      <span className="period-label">Período</span>
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
        value={value.start}
        max={value.end}
        onChange={(e) => onChange({ preset: 'custom', start: e.target.value, end: value.end })}
        aria-label="Data inicial"
      />
      <span style={{ color: '#8a8a8a', fontSize: 12 }}>até</span>
      <input
        type="date"
        className="date-input"
        value={value.end}
        min={value.start}
        max={maxDate}
        onChange={(e) => onChange({ preset: 'custom', start: value.start, end: e.target.value })}
        aria-label="Data final"
      />
      <span className="period-desc">{presetLabel(value.preset)}</span>
    </div>
  );
}

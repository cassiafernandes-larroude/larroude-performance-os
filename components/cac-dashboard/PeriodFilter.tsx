'use client';

import { useEffect } from 'react';

export type Preset = 7 | 28 | 60 | 90 | 'custom';

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

export function presetRange(preset: Exclude<Preset, 'custom'>, refDate: string): PeriodState {
  const ref = new Date(refDate + 'T12:00:00');
  return {
    preset,
    start: isoDaysAgo(preset - 1, ref),
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
  useEffect(() => {
    if (value.end > maxDate) {
      onChange({ ...value, end: maxDate });
    }
  }, [maxDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPreset = (p: Exclude<Preset, 'custom'>) => onChange(presetRange(p, maxDate));

  return (
    <div className="period-bar" role="group" aria-label="Filtro de período">
      <span className="period-label">Período</span>
      <button
        className={`period-btn ${value.preset === 7 ? 'active' : ''}`}
        onClick={() => setPreset(7)}
      >
        7D
      </button>
      <button
        className={`period-btn ${value.preset === 28 ? 'active' : ''}`}
        onClick={() => setPreset(28)}
      >
        28D
      </button>
      <button
        className={`period-btn ${value.preset === 60 ? 'active' : ''}`}
        onClick={() => setPreset(60)}
      >
        60D
      </button>
      <button
        className={`period-btn ${value.preset === 90 ? 'active' : ''}`}
        onClick={() => setPreset(90)}
      >
        90D
      </button>
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
      <span className="period-desc">
        {value.preset === 'custom' ? 'Período customizado' : `Últimos ${value.preset} dias`}
      </span>
    </div>
  );
}

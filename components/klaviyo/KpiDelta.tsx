'use client';
import React from 'react';

interface DeltaProps {
  label: string;
  value: string;
  prior?: number | null;     // % change vs prior period
  yoy?: number | null;       // % change vs same period last year
  sub?: string;
  accent?: string;           // top accent bar color (hex)
  invertColor?: boolean;     // if true, higher is bad (bounce/unsub)
}

function fmtPctSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function Arrow({ value, invertColor }: { value: number | null | undefined; invertColor?: boolean }) {
  if (value === null || value === undefined || isNaN(value)) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  const isUp = value > 0;
  const isGood = invertColor ? !isUp : isUp;
  const color = value === 0 ? 'var(--ink-3)' : (isGood ? 'var(--green)' : 'var(--red)');
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '·';
  return <span style={{ color, fontWeight: 800, marginRight: 2 }}>{arrow}</span>;
}

export function KpiDelta({ label, value, prior, yoy, sub, accent = 'var(--pink)', invertColor }: DeltaProps) {
  return (
    <div className="kpi" style={{ position: 'relative', paddingTop: 18 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <span style={{ whiteSpace: 'nowrap' }}>
          <Arrow value={prior} invertColor={invertColor} />
          <span style={{ color: prior === null || prior === undefined ? 'var(--ink-3)' : (invertColor ? (prior < 0 ? 'var(--green)' : 'var(--red)') : (prior >= 0 ? 'var(--green)' : 'var(--red)')), fontWeight: 700 }}>
            {fmtPctSigned(prior)}
          </span>
          <span style={{ color: 'var(--ink-3)', marginLeft: 4 }}>vs prior</span>
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>
          <Arrow value={yoy} invertColor={invertColor} />
          <span style={{ color: yoy === null || yoy === undefined ? 'var(--ink-3)' : (invertColor ? (yoy < 0 ? 'var(--green)' : 'var(--red)') : (yoy >= 0 ? 'var(--green)' : 'var(--red)')), fontWeight: 700 }}>
            {fmtPctSigned(yoy)}
          </span>
          <span style={{ color: 'var(--ink-3)', marginLeft: 4 }}>YoY</span>
        </span>
      </div>
      {sub && <div className="sub" style={{ marginTop: 4, color: 'var(--ink-3)', fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

// Formatadores compactos (K/M)
// market = 'BR' usa R$, 'US' ou undefined usa $
export function fmtCompact(n: number, unit: '$' | '' = '', market?: string): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${unit}${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${unit}${(n / 1_000).toFixed(1)}K`;
  return `${unit}${n.toFixed(0)}`;
}

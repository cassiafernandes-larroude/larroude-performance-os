'use client';
import React from 'react';
export { fmtRpr } from '@/lib/klaviyo/utils';

// fmtUsd / fmtUsdCents mantidos por compatibilidade — sempre $
export const fmtUsd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const fmtUsdCents = (n: number) => '$' + n.toFixed(2);
// Versões market-aware: BR usa R$ + pt-BR locale, US usa $ + en-US
export function fmtMoney(n: number, market?: string): string {
  if (market === 'BR') return 'R$' + Math.round(n).toLocaleString('pt-BR');
  return '$' + Math.round(n).toLocaleString('en-US');
}
export function fmtMoneyCents(n: number, market?: string): string {
  if (market === 'BR') return 'R$' + n.toFixed(2).replace('.', ',');
  return '$' + n.toFixed(2);
}
export function fmtMoneyCompact(n: number, market?: string): string {
  const sym = market === 'BR' ? 'R$' : '$';
  if (Math.abs(n) >= 1_000_000) return `${sym}${(n/1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${sym}${(n/1_000).toFixed(1)}k`;
  return `${sym}${Math.round(n).toLocaleString(market === 'BR' ? 'pt-BR' : 'en-US')}`;
}
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
export const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
export const fmtShortDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—';

export function Kpi({ label, value, sub, color, onClick }: { label: string; value: string | number; sub?: React.ReactNode; color?: 'pink'|'orange'|'purple'|'teal'|'blue'|'gold'|'green'|'red'; onClick?: () => void }) {
  const style: React.CSSProperties = color ? {
    background: `linear-gradient(180deg, var(--paper), var(--${color}-soft))`,
    borderColor: `var(--${color})`
  } : {};
  return (
    <div className={'kpi' + (onClick ? ' clickable' : '')} style={style} onClick={onClick}>
      <div className="label" style={color ? { color: `var(--${color})` } : undefined}>{label}</div>
      <div className="value" style={color ? { color: `var(--${color})` } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function SectionHead({ pill, pillVariant = 'gold', title, right }: { pill: string; pillVariant?: 'gold'|'teal'|'blue'|'pink'|'orange'|'purple'|'green'|'red'; title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="section-head">
      <span className={`section-pill sp-${pillVariant}`}>{pill}</span>
      <span className="title">{title}</span>
      {right && <span className="right-info">{right}</span>}
    </div>
  );
}

export function StatusBadge({ kind, label }: { kind: 'red'|'gold'|'green'|'blue'|'gray'|'pink'|'teal'; label: string }) {
  return <span className={`status-badge st-${kind}`}>{label}</span>;
}

// Cassia 2026-06-14: card comparativo Campanhas vs Flows (2 valores side-by-side)
export function CompareCard({ label, camp, flow, note, warn }: { label: string; camp: string; flow: string; note?: string; warn?: boolean }) {
  return (
    <div className="kpi-compare">
      <div className="kc-label">{label}</div>
      <div className="kc-values">
        <div className="kc-col">
          <div className="kc-val kc-camp">{camp}</div>
          <div className="kc-tag"><span className="kc-dot" style={{ background: '#3b82f6' }} /> Camp.</div>
        </div>
        <div className="kc-col">
          <div className="kc-val kc-flow">{flow}</div>
          <div className="kc-tag"><span className="kc-dot" style={{ background: '#7c3aed' }}>⚡</span> Flows</div>
        </div>
      </div>
      {note && <div className="kc-note">{warn && <span className="kc-warn">⚠ </span>}{note}</div>}
    </div>
  );
}

export function HBar({ value, max, color = 'teal', label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar-wrap">
      <div className="bar-track"><div className={`bar-fill b-${color}`} style={{ width: pct + '%' }} /></div>
      {label && <div className="bar-num">{label}</div>}
    </div>
  );
}

export function VBarChart({ points, valueKey, format, color = 'teal', xLabels }: { points: any[]; valueKey: string; format: (n: number) => string; color?: string; xLabels?: number }) {
  const vals = points.map(p => p[valueKey] || 0);
  const max = Math.max(...vals, 1);
  const avg = vals.reduce((s,v) => s+v, 0) / (vals.length || 1);
  return (
    <>
      <div className="vbar-chart">
        <div className="avg-line" style={{ bottom: (avg / max * 100) + '%' }} />
        {points.map((p, i) => {
          const v = p[valueKey] || 0;
          const h = max > 0 ? (v / max) * 100 : 0;
          const below = v < avg;
          return (
            <div key={i} className={'col' + (below ? ' below' : '')}>
              {i === points.length - 1 && <div className="top-num">{format(v)}</div>}
              <div className="bar" style={{ height: h + '%', background: below ? 'var(--red)' : `var(--${color})` }} />
            </div>
          );
        })}
      </div>
      <div className="vbar-x-axis">
        {points.length > 0 && <span>{p2x(points[0])}</span>}
        {points.length > 2 && <span>{p2x(points[Math.floor(points.length/2)])}</span>}
        {points.length > 1 && <span>{p2x(points[points.length-1])}</span>}
      </div>
    </>
  );
}
function p2x(p: any): string {
  if (p.weekStart) return fmtShortDate(p.weekStart);
  if (p.dayName) return p.dayName;
  return '';
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pagination({ page, perPage, total, onChange }: { page: number; perPage: number; total: number; onChange: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="pagination">
      <button disabled={page <= 1} onClick={() => onChange(page-1)}>&lsaquo; Previous</button>
      <span className="pg-info">Page <b>{page}</b> of <b>{last}</b> &middot; showing {Math.min(perPage, total - (page-1)*perPage)} of {total}</span>
      <button disabled={page >= last} onClick={() => onChange(page+1)}>Next &rsaquo;</button>
    </div>
  );
}

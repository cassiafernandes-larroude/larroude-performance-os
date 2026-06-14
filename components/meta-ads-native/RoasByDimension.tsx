'use client';
// Cassia 2026-06-14: bloco "ROAS by [dimensão]" — barra horizontal proporcional, ROAS, spend.
// Filtra apenas categorias com spend >= $1000.

import { formatCurrency, formatDecimal } from '@/lib/meta-ads-native/format';
import type { DimensionRow } from '@/lib/meta-ads-native/ad-dimensions';

interface Props {
  title: string;
  icon?: string;
  rows: DimensionRow[];
  currency: string;
  tip?: string;
}

export default function RoasByDimension({ title, icon = '🎬', rows, currency, tip }: Props) {
  const maxRoas = Math.max(1, ...rows.map(r => r.roas));
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[18px]">{icon}</span>
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] py-4 text-center" style={{ color: 'var(--ink-muted)' }}>
          Nenhuma categoria com spend ≥ $1.000.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const widthPct = Math.min(100, Math.round((r.roas / maxRoas) * 100));
            return (
              <div key={r.label} className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-[12px]">
                <div className="w-[110px] sm:w-[140px] shrink-0">
                  <span className="font-bold uppercase tracking-wide" style={{ color: 'var(--ink)' }}>{r.label}</span>
                  <span className="ml-1" style={{ color: 'var(--ink-muted)' }}>({r.ads} ads)</span>
                </div>
                <div className="flex-1 h-5 rounded relative overflow-hidden" style={{ background: 'var(--paper)' }}>
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${widthPct}%`,
                      background: r.roas >= 2 ? '#3b82f6' : r.roas >= 1 ? '#60a5fa' : '#94a3b8',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
                <div className="w-[55px] text-right font-num font-bold tabular-nums" style={{ color: r.roas >= 2 ? '#10b981' : r.roas >= 1 ? '#f59e0b' : 'var(--ink-muted)' }}>
                  {formatDecimal(r.roas)}×
                </div>
                <div className="w-[70px] text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                  {formatCurrency(r.spend, currency, true)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tip && (
        <div className="text-[10px] italic mt-3" style={{ color: 'var(--ink-muted)' }}>
          {tip}
        </div>
      )}
    </div>
  );
}

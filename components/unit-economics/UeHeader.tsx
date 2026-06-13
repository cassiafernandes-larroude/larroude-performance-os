'use client';

import Link from 'next/link';
import { Tag } from 'lucide-react';
import type { Market } from '@/lib/unit-economics/queries';

interface Props {
  market: Market;
  onMarketChange: (m: Market) => void;
  onRefresh: () => void;
  onExportPdf: () => void;
  refreshing: boolean;
  startDate?: string;
  endDate?: string;
}

// Mesmas constantes de estilo do main-dashboard/Header.tsx
const PILL_BASE =
  'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const MARKET_ACTIVE = `${PILL_BASE} bg-[#ec4899] text-white px-3 sm:px-4 py-1.5`;
const MARKET_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-4 py-1.5`;

function fmtRange(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  };
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
}

export default function UeHeader({
  market,
  onMarketChange,
  onRefresh,
  onExportPdf,
  refreshing,
  startDate,
  endDate,
}: Props) {
  const today = endDate
    ? new Date(endDate + 'T00:00:00Z').toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';
  return (
    <header className="mb-6 no-print-bg">
      {/* Row 1: title + PDF/Refresh */}
      <div className="pt-8 pb-2 flex items-start justify-between gap-4 flex-wrap">
        <h1
          className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
          style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
        >
          Unit Economics
        </h1>
        <div className="flex items-center gap-2 no-print flex-wrap">
          {/* Cassia 2026-06-13: link para nova aba Campaigns */}
          <Link
            href="/unit-economics/campaigns"
            className="inline-flex items-center gap-1.5"
            title="Build discount campaigns"
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: '#FFFFFF',
              color: '#FF3D8B',
              border: '1.5px solid #FF3D8B',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <Tag style={{ width: 14, height: 14 }} />
            <span>Campaigns</span>
          </Link>
          <button
            onClick={onExportPdf}
            className="pill pill-ghost px-3 py-1.5 text-[12px] flex items-center gap-1.5"
            title="Export dashboard as PDF"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
            <span>PDF</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="pill pill-pink px-3 py-1.5 text-[12px] flex items-center gap-1.5 font-medium"
            style={{ opacity: refreshing ? 0.6 : 1 }}
            title="Refresh data"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={refreshing ? 'animate-spin' : ''}
            >
              <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
              <polyline points="21 3 21 9 15 9" />
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
              <polyline points="3 21 3 15 9 15" />
            </svg>
            <span>{refreshing ? 'Refreshing...' : 'Refresh now'}</span>
          </button>
        </div>
      </div>

      {/* Row 2: market toggle (US/BR) — idêntico aos outros dashboards */}
      <div className="pb-3 flex items-center gap-2 no-print">
        {(['US', 'BR'] as const).map((m) => {
          const active = market === m;
          return (
            <button
              key={m}
              onClick={() => onMarketChange(m)}
              className={active ? MARKET_ACTIVE : MARKET_INACTIVE}
            >
              <span className="text-[10px] font-bold opacity-70 mr-1.5">{m}</span>
              {m === 'US' ? 'United States' : 'Brazil'}
            </button>
          );
        })}
      </div>

      {/* Row 3: subtitle */}
      <div className="pb-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Per-unit contribution margin · sells D-1 + catalog all SKUs + returns 30d · data from{' '}
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
            {today}
          </span>
        </p>
      </div>

      {/* Row 4: card (read-only — UE = D-1 sempre) */}
      <div
        className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 no-print"
        style={{ background: 'white', border: '0.8px solid #e5e3de' }}
      >
        <span
          className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1"
          style={{ color: '#9ca3af' }}
        >
          Period
        </span>
        <span className={`${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`}>
          Yesterday (D-1)
        </span>
        <div className="h-7 w-px mx-1" style={{ background: '#e5e3de' }} />
        <span className="text-[13px] font-medium px-3" style={{ color: 'var(--ink)' }}>
          {today}
        </span>
        <div className="ml-auto" />
        <span className="text-[12px] italic" style={{ color: '#9ca3af' }}>
          Return rate · 30d rolling · refresh 30 min
        </span>
      </div>
    </header>
  );
}

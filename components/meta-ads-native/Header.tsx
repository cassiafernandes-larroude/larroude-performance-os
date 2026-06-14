'use client';
// Cassia 2026-06-14: Header alinhado com o Main Dashboard (mesma tipografia, pills, layout).
import { useEffect, useState } from 'react';
import type { Period, Region, DateRange } from '@/lib/meta-ads-native/types';

const PERIODS: Period[] = ['1d', '7d', '14d', '28d', '3M', '6M', '12M'];

interface Props {
  region: Region;
  period: Period;
  lastUpdated?: string;
  dateRange?: DateRange;
  onRegionChange: (r: Region) => void;
  onPeriodChange: (p: Period) => void;
  onCustomRange?: (range: DateRange) => void;
  onRefresh: () => void;
  onExportPdf?: () => void;
}

const PILL_BASE =
  'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const PILL_ACTIVE_DARK = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-5 py-1.5 sm:py-2`;
const MARKET_ACTIVE = `${PILL_BASE} bg-[#ec4899] text-white px-3 sm:px-4 py-1.5`;
const MARKET_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-4 py-1.5`;

function periodLabel(p: Period): string {
  if (p === '1d') return 'D-1';
  return p.toUpperCase();
}

function activePeriodLabel(p: Period, isCustom: boolean): string {
  if (isCustom) return 'Custom range';
  switch (p) {
    case '1d': return 'Yesterday';
    case '7d': return 'Last 7 days';
    case '14d': return 'Last 14 days';
    case '28d': return 'Last 28 days';
    case '3M': return 'Last 3 months';
    case '6M': return 'Last 6 months';
    case '12M': return 'Last 12 months';
    case 'custom': return 'Custom range';
  }
}

function fmtRange(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
}

export default function Header({
  region, period, lastUpdated, dateRange,
  onRegionChange, onPeriodChange, onCustomRange, onRefresh, onExportPdf,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [draftStart, setDraftStart] = useState<string>(dateRange?.since ?? '');
  const [draftEnd, setDraftEnd] = useState<string>(dateRange?.until ?? '');

  useEffect(() => {
    if (dateRange) {
      setDraftStart(dateRange.since);
      setDraftEnd(dateRange.until);
    }
  }, [dateRange?.since, dateRange?.until]);

  const isCustom = period === 'custom';

  function applyDates() {
    if (!draftStart || !draftEnd) {
      alert('Select a start and end date.');
      return;
    }
    if (draftStart > draftEnd) {
      alert('Start date must be before or equal to end date.');
      return;
    }
    if (onCustomRange) onCustomRange({ since: draftStart, until: draftEnd });
  }

  async function handleRefresh() {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }

  return (
    <header className="mb-6 no-print-bg">
      {/* Row 1: title + PDF/Refresh */}
      <div className="pt-8 pb-2 flex items-start justify-between gap-4 flex-wrap">
        <h1
          className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
          style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
        >
          Larroudé · Meta Ads
        </h1>

        <div className="flex items-center gap-2 no-print">
          {onExportPdf && (
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
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="pill pill-pink px-3 py-1.5 text-[12px] flex items-center gap-1.5 font-medium"
            style={{ opacity: refreshing ? 0.6 : 1 }}
            title="Refresh Meta Ads data"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'animate-spin' : ''}>
              <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
              <polyline points="21 3 21 9 15 9" />
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
              <polyline points="3 21 3 15 9 15" />
            </svg>
            <span>{refreshing ? 'Refreshing...' : 'Refresh now'}</span>
          </button>
        </div>
      </div>

      {/* Row 2: market toggle (US/BR) */}
      <div className="pb-3 flex items-center gap-2 no-print">
        {(['US', 'BR'] as const).map((m) => {
          const active = region === m;
          return (
            <button
              key={m}
              onClick={() => onRegionChange(m)}
              className={active ? MARKET_ACTIVE : MARKET_INACTIVE}
            >
              <span className="text-[10px] font-bold opacity-70 mr-1.5">{m}</span>
              {m === 'US' ? 'United States' : 'Brazil'}
            </button>
          );
        })}
      </div>

      {/* Row 3: subtitle + period range */}
      <div className="pb-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Meta Ads · {region === 'US' ? 'Larroudé US + PRE-ORDER US + Larroude New' : 'Larroudé Brasil + Larroude BR - Pre-Order'} · data from{' '}
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
            {fmtRange(dateRange?.since, dateRange?.until)}
          </span>
          {' '}- via Meta Graph API
        </p>
      </div>

      {/* Row 4: filter card */}
      <div
        className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 no-print"
        style={{ background: 'white', border: '0.8px solid #e5e3de' }}
      >
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1" style={{ color: '#9ca3af' }}>
          PERIOD
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={active ? PILL_ACTIVE_DARK : PILL_INACTIVE}
              >
                {periodLabel(p)}
              </button>
            );
          })}
        </div>

        <div className="h-7 w-px mx-1" style={{ background: '#e5e3de' }} />

        <input
          type="date"
          value={draftStart}
          onChange={(e) => setDraftStart(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
          className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
          style={{
            border: `1px solid ${isCustom ? '#ec4899' : '#e5e3de'}`,
            boxShadow: isCustom ? '0 0 0 1px rgba(236,72,153,0.30)' : 'none',
          }}
        />
        <span className="text-[13px]" style={{ color: '#6b7280' }}>to</span>
        <input
          type="date"
          value={draftEnd}
          onChange={(e) => setDraftEnd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
          className="rounded-full px-4 py-2 text-[13px] bg-white font-medium"
          style={{
            border: `1px solid ${isCustom ? '#ec4899' : '#e5e3de'}`,
            boxShadow: isCustom ? '0 0 0 1px rgba(236,72,153,0.30)' : 'none',
          }}
        />
        <button onClick={applyDates} className={PILL_ACTIVE_DARK} title="Apply date range">
          Apply
        </button>

        <span className="ml-auto text-[13px] italic px-2" style={{ color: '#9ca3af' }}>
          {activePeriodLabel(period, isCustom)}
        </span>
      </div>

      {lastUpdated && (
        <div className="text-[11px] text-right mt-2 italic" style={{ color: '#9ca3af' }}>
          Last updated: {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </header>
  );
}

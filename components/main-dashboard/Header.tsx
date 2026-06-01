'use client';

import { useEffect, useState } from 'react';
import type { Market, PeriodKey, PeriodRange } from '@/lib/main-dashboard/types';

interface Props {
  market: Market;
  period: PeriodKey;
  customStart?: string;
  customEnd?: string;
  isCustom?: boolean;
  onMarketChange: (m: Market) => void;
  onPeriodChange: (p: PeriodKey) => void;
  onCustomRange: (start: string, end: string) => void;
  onRefresh: () => void;
  onExportPdf: () => void;
  refreshing: boolean;
  generatedAt?: string;
  periodRange?: PeriodRange;
}

const PERIODS: PeriodKey[] = ['1d', '7d', '14d', '28d', '3M', '6M', '12M'];

// Display label uppercase ("1D" instead of "1d") to match design spec
function periodLabel(p: PeriodKey): string {
  return p.toUpperCase();
}

// Short human readable label for the active period (shown right of Apply)
function activePeriodLabel(p: PeriodKey, isCustom: boolean, days?: number): string {
  if (isCustom) {
    if (days && days > 0) return `Last ${days} day${days === 1 ? '' : 's'}`;
    return 'Custom range';
  }
  switch (p) {
    case '1d': return 'Yesterday';
    case '7d': return 'Last 7 days';
    case '14d': return 'Last 14 days';
    case '28d': return 'Last 28 days';
    case '3M': return 'Last 3 months';
    case '6M': return 'Last 6 months';
    case '12M': return 'Last 12 months';
  }
}

function fmtEN(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function fmtRangeEN(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
}

export default function Header({
  market, period, customStart, customEnd, isCustom,
  onMarketChange, onPeriodChange, onCustomRange, onRefresh, onExportPdf,
  refreshing, generatedAt, periodRange,
}: Props) {
  const [draftStart, setDraftStart] = useState<string>(customStart ?? '');
  const [draftEnd, setDraftEnd] = useState<string>(customEnd ?? '');

  useEffect(() => {
    if (periodRange) {
      setDraftStart(periodRange.start);
      setDraftEnd(periodRange.end);
    }
  }, [periodRange?.start, periodRange?.end]);

  function applyDates() {
    if (!draftStart || !draftEnd) { alert('Select a start and end date.'); return; }
    if (draftStart > draftEnd) { alert('Start date must be before or equal to end date.'); return; }
    onCustomRange(draftStart, draftEnd);
  }

  return (
    <header className="mb-6 no-print-bg">
      {/* Title row - market toggle on the right */}
      <div className="px-6 lg:px-8 pt-8 pb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[32px] font-semibold text-ink leading-tight">
            Larroude - Dashboard
          </h1>
          <p className="text-sm text-steel mt-2">
            Meta Ads + Google Ads + Shopify + Klaviyo - via BigQuery - data from{' '}
            <span className="font-semibold text-ink">{fmtRangeEN(periodRange?.start, periodRange?.end)}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Updated at {fmtEN(generatedAt)}
          </p>
        </div>

        {/* Market toggle (US / BR) - moved out of the filter bar to match design spec */}
        <div className="flex items-center gap-2 no-print">
          {(['US', 'BR'] as const).map((m) => {
            const active = market === m;
            return (
              <button
                key={m}
                onClick={() => onMarketChange(m)}
                className={active ? 'pill pill-active-accent' : 'pill pill-inactive'}
              >
                <span className="text-[11px] font-bold opacity-70 mr-0.5">{m}</span>
                {m === 'US' ? 'United States' : 'Brazil'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar - period only (market is in the title row above) */}
      <div className="px-6 lg:px-8 py-4 flex flex-wrap items-center gap-3 no-print">
        {/* Period presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mr-1">Period</span>
          {PERIODS.map((p) => {
            const active = period === p && !isCustom;
            return (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={active ? 'pill pill-active' : 'pill pill-inactive'}
              >
                {periodLabel(p)}
              </button>
            );
          })}
        </div>

        {/* Calendar range */}
        <div className="flex items-center gap-1.5 ml-1">
          <input
            type="date"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
            className={`border rounded-lg px-2.5 py-1 text-xs bg-white ${
              isCustom ? 'border-accent ring-1 ring-accent/30' : 'border-card-border'
            }`}
          />
          <span className="text-xs text-steel">to</span>
          <input
            type="date"
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
            className={`border rounded-lg px-2.5 py-1 text-xs bg-white ${
              isCustom ? 'border-accent ring-1 ring-accent/30' : 'border-card-border'
            }`}
          />
          <button
            onClick={applyDates}
            className="pill pill-active"
            title="Apply date range"
          >
            Apply
          </button>
          {/* Active window label - italic gray, matches design spec */}
          <span className="ml-2 text-xs italic text-steel">
            {activePeriodLabel(period, !!isCustom, periodRange?.days)}
          </span>
        </div>

        {/* PDF + Refresh */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onExportPdf}
            className="pill pill-inactive"
            title="Export dashboard as PDF"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
            PDF
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="pill pill-active-accent disabled:opacity-60 disabled:cursor-not-allowed"
            title="Refresh BigQuery data"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'animate-spin' : ''}>
              <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
              <polyline points="21 3 21 9 15 9" />
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
              <polyline points="3 21 3 15 9 15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh now'}
          </button>
        </div>
      </div>
    </header>
  );
}

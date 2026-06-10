'use client';

import type { Market } from '@/lib/unit-economics/queries';

interface Props {
  market: Market;
  onMarketChange: (m: Market) => void;
  onRefresh: () => void;
  onExportPdf: () => void;
  refreshing: boolean;
  windowLabel: string; // ex: "last 60 days"
}

const PILL_BASE =
  'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const MARKET_ACTIVE = `${PILL_BASE} bg-[#ec4899] text-white px-3 sm:px-4 py-1.5`;
const MARKET_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-4 py-1.5`;

export default function UeHeader({
  market,
  onMarketChange,
  onRefresh,
  onExportPdf,
  refreshing,
  windowLabel,
}: Props) {
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
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={onExportPdf}
            className="pill pill-ghost px-3 py-1.5 text-[12px] flex items-center gap-1.5"
            title="Export PDF"
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
            <span>{refreshing ? 'Refreshing…' : 'Refresh now'}</span>
          </button>
        </div>
      </div>

      {/* Row 2: market pills */}
      <div className="pb-3 flex items-center gap-2">
        <button
          onClick={() => onMarketChange('US')}
          className={market === 'US' ? MARKET_ACTIVE : MARKET_INACTIVE}
        >
          <span className="opacity-70 mr-1.5 text-[10px]">US</span>
          United States
        </button>
        <button
          onClick={() => onMarketChange('BR')}
          className={market === 'BR' ? MARKET_ACTIVE : MARKET_INACTIVE}
        >
          <span className="opacity-70 mr-1.5 text-[10px]">BR</span>
          Brazil
        </button>
      </div>

      {/* Row 3: subtitle (no period selector — UE is a per-unit calculator) */}
      <div className="pb-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Per-unit contribution margin · averages from{' '}
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
            {windowLabel}
          </span>{' '}
          · via Shopify Admin + Meta API + Supermetrics
        </p>
      </div>
    </header>
  );
}

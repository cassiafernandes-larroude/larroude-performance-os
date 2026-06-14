'use client';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/meta-ads-native/cn';
import type { Period, Region, DateRange } from '@/lib/meta-ads-native/types';

const PERIODS: { id: Period; label: string }[] = [
  { id: '1d',  label: '1D'  },
  { id: '7d',  label: '7D'  },
  { id: '14d', label: '14D' },
  { id: '28d', label: '28D' },
  { id: '3M',  label: '3M'  },
  { id: '6M',  label: '6M'  },
  { id: '12M', label: '12M' },
];

const PERIOD_LABELS: Record<Period, string> = {
  '1d':  'Last day',
  '7d':  'Last 7 days',
  '14d': 'Last 14 days',
  '28d': 'Last 28 days',
  '3M':  'Last 3 months',
  '6M':  'Last 6 months',
  '12M': 'Last 12 months',
  'custom': 'Custom range',
};

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

function formatLongDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Header({
  region, period, lastUpdated, dateRange,
  onRegionChange, onPeriodChange, onCustomRange, onRefresh, onExportPdf,
}: Props) {
  const [time, setTime] = useState<string>('—');
  const [since, setSince] = useState<string>('');
  const [until, setUntil] = useState<string>('');

  useEffect(() => {
    if (!lastUpdated) return setTime('—');
    const d = new Date(lastUpdated);
    setTime(d.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' }));
  }, [lastUpdated]);

  useEffect(() => {
    if (dateRange) {
      setSince(dateRange.since);
      setUntil(dateRange.until);
    }
  }, [dateRange]);

  const applyCustom = () => {
    if (since && until && onCustomRange) onCustomRange({ since, until });
  };

  return (
    <header className="bg-transparent">
      <div className="max-w-[1480px] mx-auto px-8 pt-8 pb-6">
        {/* Title - exact CAC: 32px / weight 600 / letter-spacing -0.64px / no Inter font */}
        <h1 className="text-[32px] text-ink-900" style={{ fontWeight: 600, letterSpacing: '-0.64px', margin: 0 }}>
          Larroudé - Meta Ads
        </h1>

        {/* Region pills - exact CAC: 12px / weight 600 / 6px 14px padding */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <button
            onClick={() => onRegionChange('US')}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}
            className={cn(
              "inline-flex items-center gap-1.5 transition-colors",
              region === 'US'
                ? "bg-brand-500 text-white"
                : "bg-ink-50 text-ink-600 hover:bg-ink-100"
            )}
          >
            <span className={cn(
              "px-1 py-0 rounded text-[10px] font-bold",
              region === 'US' ? "bg-white/25 text-white" : "bg-white text-ink-600"
            )}>US</span>
            <span>United States</span>
          </button>

          <button
            onClick={() => onRegionChange('BR')}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}
            className={cn(
              "inline-flex items-center gap-1.5 transition-colors",
              region === 'BR'
                ? "bg-brand-500 text-white"
                : "bg-ink-50 text-ink-600 hover:bg-ink-100"
            )}
          >
            <span className={cn(
              "px-1 py-0 rounded text-[10px] font-bold",
              region === 'BR' ? "bg-white/25 text-white" : "bg-white text-ink-600"
            )}>BR</span>
            <span>Brasil</span>
          </button>
        </div>

        {/* Subtitle */}
        <p className="text-[15px] text-ink-700 mt-4 leading-normal">
          Meta Ads performance for {region === 'US' ? 'Larroudé US + PRE-ORDER US + Larroude New' : 'Larroudé Brasil + Larroude BR - Pre-Order'} · data through{' '}
          {dateRange && (
            <strong className="text-ink-900 font-semibold">{formatLongDate(dateRange.until)}</strong>
          )}
          {' '}· via Meta Marketing API
        </p>
        <div className="text-[12px] text-ink-500 mt-1">Last updated {time}</div>

        {/* Filter card */}
        <div className="mt-5 bg-white rounded-2xl border border-stone-200 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold tracking-widest text-ink-400 uppercase mr-1">Period</span>

            {/* Period pills - exact CAC: 12px / weight 600 / 6px 14px / bg ink-900 active */}
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => onPeriodChange(p.id)}
                style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}
                className={cn(
                  "transition-colors",
                  period === p.id
                    ? "bg-ink-900 text-white"
                    : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                )}
              >
                {p.label}
              </button>
            ))}

            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="ml-3 px-2.5 py-1.5 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <span className="text-xs text-ink-500">to</span>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={applyCustom}
              style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}
              className="bg-ink-900 text-white hover:bg-ink-800 transition-colors"
            >
              Apply
            </button>

            <div className="flex-1" />

            <span className="text-xs text-ink-400 italic hidden md:inline">{PERIOD_LABELS[period]}</span>

            {onExportPdf && (
              <button
                onClick={onExportPdf}
                style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}
                className="inline-flex items-center gap-1.5 bg-ink-50 text-ink-600 hover:bg-ink-100 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <span>PDF</span>
              </button>
            )}

            <button
              onClick={onRefresh}
              style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}
              className="inline-flex items-center gap-1.5 bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              <span>Refresh now</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

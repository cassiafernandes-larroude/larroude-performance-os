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

// Presets per design spec: 7D / 28D / 60D / 90D
const PERIODS: PeriodKey[] = ['7d', '28d', '60d', '90d'];

function periodLabel(p: PeriodKey): string {
  return p.toUpperCase().replace('D', 'D');
}

// "Ultimos N dias" label (PT-BR) to match design spec
function activePeriodLabel(p: PeriodKey, isCustom: boolean, days?: number): string {
  if (isCustom) {
    if (days && days > 0) return `Ultimos ${days} dia${days === 1 ? '' : 's'}`;
    return 'Intervalo customizado';
  }
  switch (p) {
    case '1d': return 'Ontem';
    case '7d': return 'Ultimos 7 dias';
    case '14d': return 'Ultimos 14 dias';
    case '28d': return 'Ultimos 28 dias';
    case '60d': return 'Ultimos 60 dias';
    case '90d': return 'Ultimos 90 dias';
    case '3M': return 'Ultimos 3 meses';
    case '6M': return 'Ultimos 6 meses';
    case '12M': return 'Ultimos 12 meses';
  }
}

function fmtBR(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtRangeBR(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return `${s.toLocaleDateString('pt-BR', opts)} - ${e.toLocaleDateString('pt-BR', opts)}`;
}

// Pill button styling (matches design spec)
const PILL_BASE = 'inline-flex items-center justify-center rounded-full text-[13px] font-semibold transition-all duration-150 select-none';
const PILL_ACTIVE = `${PILL_BASE} bg-[#1a1a1a] text-white px-5 py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-5 py-2`;
const PILL_ACTIVE_ACCENT = `${PILL_BASE} bg-[#ec4899] text-white px-4 py-2`;

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
    if (!draftStart || !draftEnd) { alert('Selecione data inicial e final.'); return; }
    if (draftStart > draftEnd) { alert('Data inicial deve ser anterior ou igual a data final.'); return; }
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
            Meta Ads + Google Ads + Shopify + Klaviyo - via BigQuery - dados de{' '}
            <span className="font-semibold text-ink">{fmtRangeBR(periodRange?.start, periodRange?.end)}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Atualizado em {fmtBR(generatedAt)}
          </p>
        </div>

        {/* Market toggle (US / BR) */}
        <div className="flex items-center gap-2 no-print">
          {(['US', 'BR'] as const).map((m) => {
            const active = market === m;
            return (
              <button
                key={m}
                onClick={() => onMarketChange(m)}
                className={active ? PILL_ACTIVE_ACCENT : PILL_INACTIVE}
              >
                <span className="text-[11px] font-bold opacity-70 mr-1.5">{m}</span>
                {m === 'US' ? 'United States' : 'Brasil'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar in a single rounded card - matches design spec */}
      <div
        className="mx-6 lg:mx-8 my-2 px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 no-print"
        style={{ background: 'white', border: '0.8px solid #e5e3de' }}
      >
        {/* Period presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#9ca3af] mr-1">
            PERIODO
          </span>
          {PERIODS.map((p) => {
            const active = period === p && !isCustom;
            return (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={active ? PILL_ACTIVE : PILL_INACTIVE}
              >
                {periodLabel(p)}
              </button>
            );
          })}
        </div>

        {/* Vertical separator */}
        <div className="h-7 w-px bg-[#e5e3de] mx-1" />

        {/* Calendar range */}
        <div className="flex items-center gap-2">
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
          <span className="text-[13px] text-[#6b7280]">ate</span>
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
          <button
            onClick={applyDates}
            className={PILL_ACTIVE}
            title="Aplicar intervalo"
          >
            Aplicar
          </button>
        </div>

        {/* Active period label - italic gray, right side */}
        <span className="ml-auto text-[13px] italic text-[#9ca3af] px-2">
          {activePeriodLabel(period, !!isCustom, periodRange?.days)}
        </span>

        {/* PDF + Refresh */}
        <div className="flex items-center gap-2">
          <button
            onClick={onExportPdf}
            className={PILL_INACTIVE}
            title="Exportar dashboard em PDF"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
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
            className={PILL_ACTIVE_ACCENT}
            style={{ opacity: refreshing ? 0.6 : 1 }}
            title="Atualizar dados do BigQuery"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`}>
              <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
              <polyline points="21 3 21 9 15 9" />
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
              <polyline points="3 21 3 15 9 15" />
            </svg>
            {refreshing ? 'Atualizando...' : 'Atualizar agora'}
          </button>
        </div>
      </div>
    </header>
  );
}

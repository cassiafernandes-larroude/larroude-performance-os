'use client';

import { useEffect, useState } from 'react';
import type { Market, PeriodKey, PeriodRange } from '@/lib/main-dashboard/types';

type Lang = 'pt' | 'en';

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
  // Customizacao por pagina
  title?: string;
  subtitleSuffix?: string;
  lang?: Lang;
}

// Presets per design spec: Yesterday / 7D / 14D / 28D / 3M / 6M / 12M
// Cassia 2026-06-13: adicionado botao "Ontem (D-1)" no inicio
const PERIODS: PeriodKey[] = ['1d', '7d', '14d', '28d', '3M', '6M', '12M'];

function periodLabel(p: PeriodKey): string {
  if (p === '1d') return 'D-1';
  return p.toUpperCase();
}

function activePeriodLabel(p: PeriodKey, isCustom: boolean, days: number | undefined, lang: Lang): string {
  if (lang === 'en') {
    if (isCustom) {
      if (days && days > 0) return `Last ${days} day${days === 1 ? '' : 's'}`;
      return 'Custom range';
    }
    switch (p) {
      case '1d': return 'Yesterday';
      case '7d': return 'Last 7 days';
      case '14d': return 'Last 14 days';
      case '28d': return 'Last 28 days';
      case '60d': return 'Last 60 days';
      case '90d': return 'Last 90 days';
      case '3M': return 'Last 3 months';
      case '6M': return 'Last 6 months';
      case '12M': return 'Last 12 months';
    }
  }
  if (isCustom) {
    if (days && days > 0) return `Últimos ${days} dia${days === 1 ? '' : 's'}`;
    return 'Intervalo customizado';
  }
  switch (p) {
    case '1d': return 'Ontem';
    case '7d': return 'Últimos 7 dias';
    case '14d': return 'Últimos 14 dias';
    case '28d': return 'Últimos 28 dias';
    case '60d': return 'Últimos 60 dias';
    case '90d': return 'Últimos 90 dias';
    case '3M': return 'Últimos 3 meses';
    case '6M': return 'Últimos 6 meses';
    case '12M': return 'Últimos 12 meses';
  }
}

function fmtRange(start: string | undefined, end: string | undefined, lang: Lang): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const locale = lang === 'en' ? 'en-US' : 'pt-BR';
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return `${s.toLocaleDateString(locale, opts)} - ${e.toLocaleDateString(locale, opts)}`;
}

// Pill styles for the period buttons - smaller on mobile (px-3) bigger on desktop (px-5)
const PILL_BASE = 'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const PILL_ACTIVE_DARK = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-5 py-1.5 sm:py-2`;
const MARKET_ACTIVE = `${PILL_BASE} bg-[#ec4899] text-white px-3 sm:px-4 py-1.5`;
const MARKET_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-4 py-1.5`;

export default function Header({
  market, period, customStart, customEnd, isCustom,
  onMarketChange, onPeriodChange, onCustomRange, onRefresh, onExportPdf,
  refreshing, generatedAt, periodRange,
  title = 'Larroudé - Dashboard',
  subtitleSuffix,
  lang = 'pt',
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
    if (!draftStart || !draftEnd) {
      alert(lang === 'en' ? 'Select a start and end date.' : 'Selecione data inicial e final.');
      return;
    }
    if (draftStart > draftEnd) {
      alert(lang === 'en' ? 'Start date must be before or equal to end date.' : 'Data inicial deve ser anterior ou igual a data final.');
      return;
    }
    onCustomRange(draftStart, draftEnd);
  }

  const t = lang === 'en'
    ? {
        marketBR: 'Brazil',
        marketUS: 'United States',
        subtitleDefault: 'Meta Ads + Google Ads + Shopify + Klaviyo - data from',
        viaSource: '- via BigQuery',
        period: 'PERIOD',
        to: 'to',
        apply: 'Apply',
        applyTitle: 'Apply date range',
        pdfTitle: 'Export dashboard as PDF',
        refreshTitle: 'Refresh BigQuery data',
        refreshing: 'Refreshing...',
        refresh: 'Refresh now',
      }
    : {
        marketBR: 'Brasil',
        marketUS: 'United States',
        subtitleDefault: 'Meta Ads + Google Ads + Shopify + Klaviyo - dados de',
        viaSource: '- via BigQuery',
        period: 'PERÍODO',
        to: 'até',
        apply: 'Aplicar',
        applyTitle: 'Aplicar intervalo',
        pdfTitle: 'Exportar dashboard em PDF',
        refreshTitle: 'Atualizar dados do BigQuery',
        refreshing: 'Atualizando...',
        refresh: 'Atualizar agora',
      };

  const subtitlePrefix = subtitleSuffix ?? t.subtitleDefault;

  return (
    <header className="mb-6 no-print-bg">
      {/* Row 1: title (left) + PDF/Refresh (right) */}
      <div className="pt-8 pb-2 flex items-start justify-between gap-4 flex-wrap">
        <h1 className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}>
          {title}
        </h1>

        <div className="flex items-center gap-2 no-print">
          <button
            onClick={onExportPdf}
            className="pill pill-ghost px-3 py-1.5 text-[12px] flex items-center gap-1.5"
            title={t.pdfTitle}
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
            title={t.refreshTitle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'animate-spin' : ''}>
              <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
              <polyline points="21 3 21 9 15 9" />
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
              <polyline points="3 21 3 15 9 15" />
            </svg>
            <span>{refreshing ? t.refreshing : t.refresh}</span>
          </button>
        </div>
      </div>

      {/* Row 2: market toggle (US/BR) */}
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
              {m === 'US' ? t.marketUS : t.marketBR}
            </button>
          );
        })}
      </div>

      {/* Row 3: subtitle + period range */}
      <div className="pb-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {subtitlePrefix}{' '}
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
            {fmtRange(periodRange?.start, periodRange?.end, lang)}
          </span>
          {' '}{t.viaSource}
        </p>
      </div>

      {/* Row 4: filter card */}
      <div
        className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 no-print"
        style={{ background: 'white', border: '0.8px solid #e5e3de' }}
      >
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1" style={{ color: '#9ca3af' }}>
          {t.period}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map((p) => {
            const active = period === p && !isCustom;
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
        <span className="text-[13px]" style={{ color: '#6b7280' }}>{t.to}</span>
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
          className={PILL_ACTIVE_DARK}
          title={t.applyTitle}
        >
          {t.apply}
        </button>

        <span className="ml-auto text-[13px] italic px-2" style={{ color: '#9ca3af' }}>
          {activePeriodLabel(period, !!isCustom, periodRange?.days, lang)}
        </span>
      </div>
    </header>
  );
}

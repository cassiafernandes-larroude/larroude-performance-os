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

const PERIODS: PeriodKey[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

function fmtBR(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtRangeBR(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return `${s.toLocaleDateString('pt-BR', opts)} – ${e.toLocaleDateString('pt-BR', opts)}`;
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
    if (!draftStart || !draftEnd) { alert('Selecione data inicial e final.'); return; }
    if (draftStart > draftEnd) { alert('Data inicial deve ser anterior ou igual à data final.'); return; }
    onCustomRange(draftStart, draftEnd);
  }

  return (
    <header className="mb-6 no-print-bg">
      {/* Título — system font 32px weight 600 (igual CAC) */}
      <div className="px-6 lg:px-8 pt-8 pb-4">
        <h1 className="text-[32px] font-semibold text-ink leading-tight">
          Larroudé · Dashboard
        </h1>
        <p className="text-sm text-steel mt-2">
          Meta Ads + Google Ads + Shopify + Klaviyo · via BigQuery · dados de{' '}
          <span className="font-semibold text-ink">{fmtRangeBR(periodRange?.start, periodRange?.end)}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Atualizado em {fmtBR(generatedAt)}
        </p>
      </div>

      {/* Tabs market + período + refresh */}
      <div className="px-6 lg:px-8 py-4 flex flex-wrap items-center gap-3 no-print">
        {/* Tabs US / BR — pílulas */}
        <div className="flex items-center gap-2">
          {(['US', 'BR'] as const).map((m) => {
            const active = market === m;
            return (
              <button
                key={m}
                onClick={() => onMarketChange(m)}
                className={active ? 'pill pill-active-accent' : 'pill pill-inactive'}
              >
                <span className="text-[11px] font-bold opacity-70 mr-0.5">{m}</span>
                {m === 'US' ? 'United States' : 'Brasil'}
              </button>
            );
          })}
        </div>

        {/* Separador visual */}
        <div className="hidden lg:block w-px h-6 bg-card-border mx-2"></div>

        {/* Período */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mr-1">Período</span>
          {PERIODS.map((p) => {
            const active = period === p && !isCustom;
            return (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={active ? 'pill pill-active' : 'pill pill-inactive'}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Calendário */}
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-xs text-steel">De</span>
          <input
            type="date"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
            className={`border rounded-lg px-2.5 py-1 text-xs bg-white ${
              isCustom ? 'border-accent ring-1 ring-accent/30' : 'border-card-border'
            }`}
          />
          <span className="text-xs text-steel">até</span>
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
            title="Aplicar intervalo"
          >
            Aplicar
          </button>
        </div>

        {/* PDF + Refresh */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onExportPdf}
            className="pill pill-inactive"
            title="Exportar dashboard em PDF"
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
            title="Atualiza dados do BigQuery"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'animate-spin' : ''}>
              <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
              <polyline points="21 3 21 9 15 9" />
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
              <polyline points="3 21 3 15 9 15" />
            </svg>
            {refreshing ? 'Atualizando…' : 'Atualizar agora'}
          </button>
        </div>
      </div>
    </header>
  );
}

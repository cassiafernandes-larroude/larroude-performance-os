'use client';

import type { ProductUnitEconomics } from '@/lib/unit-economics/queries';
import type { CascadeUnit } from '@/lib/unit-economics/cascade';

interface ApiData {
  currency: 'USD' | 'BRL';
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  totalRefunds: number;
  totalMarketingSpend: number;
  marketingPerUnit: number;
  marketingCoverage: number;
}

function fmt(value: number, currency: 'USD' | 'BRL', opts: { compact?: boolean } = {}): string {
  const symbol = currency === 'USD' ? '$' : 'R$';
  if (opts.compact) {
    if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  }
  return `${symbol}${value.toLocaleString(currency === 'USD' ? 'en-US' : 'pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
  })}`;
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export default function KpiCards({ data, cascade }: { data: ApiData; cascade: CascadeUnit | null }) {
  const returnRateValue = cascade?.returnRate ?? 0;
  const returnTone =
    returnRateValue > 0.08 ? 'danger' : returnRateValue > 0.05 ? 'warn' : 'neutral';
  const mcRealPositive = cascade ? cascade.netCmReal > 0 : false;
  const mcPremPositive = cascade ? cascade.netCmAssumption > 0 : false;

  return (
    <section className="mt-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="MC BRUTA / un"
          value={cascade ? fmt(cascade.grossContributionMargin, data.currency) : '—'}
          sub={cascade ? `${pct(cascade.gcmPctOfRevenue)} da receita` : ''}
          tone="neutral"
        />
        <KpiCard
          label="MC LÍQUIDA REAL / un"
          value={cascade ? fmt(cascade.netCmReal, data.currency) : '—'}
          sub={cascade ? `Marketing real: ${fmt(cascade.marketingReal, data.currency)}` : ''}
          tone={mcRealPositive ? 'success' : 'danger'}
        />
        <KpiCard
          label="MC LÍQUIDA PREMISSA / un"
          value={cascade ? fmt(cascade.netCmAssumption, data.currency) : '—'}
          sub={cascade ? `Marketing %: ${fmt(cascade.marketingAssumption, data.currency)}` : ''}
          tone={mcPremPositive ? 'success' : 'danger'}
        />
        <KpiCard
          label="RETURN RATE"
          value={cascade ? pct(returnRateValue) : '—'}
          sub="Refunds / receita bruta"
          tone={returnTone}
        />
        <KpiCard
          label="UNIDADES"
          value={data.totalUnits.toLocaleString(data.currency === 'USD' ? 'en-US' : 'pt-BR')}
          sub={`${data.totalOrders.toLocaleString(data.currency === 'USD' ? 'en-US' : 'pt-BR')} pedidos`}
          tone="info"
        />
        <KpiCard
          label="MARKETING TOTAL"
          value={fmt(data.totalMarketingSpend, data.currency, { compact: true })}
          sub={`${fmt(data.marketingPerUnit, data.currency)} / unidade`}
          tone="alert"
        />
      </div>
    </section>
  );
}

type Tone = 'neutral' | 'success' | 'danger' | 'warn' | 'info' | 'alert';

const TONE: Record<Tone, { label: string; bg: string; border: string }> = {
  neutral: { label: '#6b7280', bg: '#ffffff', border: '#e5e3de' },
  success: { label: '#10b981', bg: '#ffffff', border: '#d1fae5' },
  danger: { label: '#dc2626', bg: '#ffffff', border: '#fee2e2' },
  warn: { label: '#d97706', bg: '#ffffff', border: '#fed7aa' },
  info: { label: '#7c3aed', bg: '#ffffff', border: '#ede9fe' },
  alert: { label: '#ea580c', bg: '#ffffff', border: '#fed7aa' },
};

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div
      className="rounded-2xl flex flex-col justify-between"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        padding: '20px 18px',
        minHeight: 130,
        boxShadow: '0 1px 2px rgba(16,24,40,.04)',
      }}
    >
      <div
        className="text-[10.5px] font-bold uppercase tracking-[0.08em] leading-tight"
        style={{ color: t.label }}
      >
        {label}
      </div>
      <div
        className="font-bold leading-none mt-2"
        style={{ color: '#111827', fontSize: 'clamp(24px, 2.6vw, 36px)' }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[11px] leading-tight mt-2"
          style={{ color: '#9ca3af' }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

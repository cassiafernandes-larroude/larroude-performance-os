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
  return (
    <section className="mt-4">
      <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
        <Card label="MC BRUTA / un" value={cascade ? fmt(cascade.grossContributionMargin, data.currency) : '—'} sub={cascade ? `${pct(cascade.gcmPctOfRevenue)} da receita` : ''} highlight />
        <Card label="MC LÍQUIDA REAL / un" value={cascade ? fmt(cascade.netCmReal, data.currency) : '—'} sub={cascade ? `Marketing real: ${fmt(cascade.marketingReal, data.currency)}` : ''} highlight />
        <Card label="MC LÍQUIDA PREMISSA / un" value={cascade ? fmt(cascade.netCmAssumption, data.currency) : '—'} sub={cascade ? `Marketing %: ${fmt(cascade.marketingAssumption, data.currency)}` : ''} />
        <Card label="RETURN RATE" value={cascade ? pct(cascade.returnRate) : '—'} sub="Refunds / receita bruta" />
        <Card label="UNIDADES" value={data.totalUnits.toLocaleString()} sub={`${data.totalOrders.toLocaleString()} pedidos`} />
        <Card label="MARKETING TOTAL" value={fmt(data.totalMarketingSpend, data.currency, { compact: true })} sub={`${fmt(data.marketingPerUnit, data.currency)} / unidade`} />
      </div>
    </section>
  );
}

function Card({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? 'kpi-card cac' : 'kpi-card'}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

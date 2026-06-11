'use client';

import { useEffect, useState } from 'react';
import type { CascadeUnit, Assumptions } from '@/lib/unit-economics/cascade';
import type { Market, ProductUnitEconomics } from '@/lib/unit-economics/queries';

interface ApiData {
  market?: Market;
  currency: 'USD' | 'BRL';
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  totalRefunds: number;
  totalMarketingSpend: number;
  marketingPerUnit: number;
  marketingCoverage: number;
  returnRate30d?: number;
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
function pct(v: number, digits: number = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export default function KpiCards({
  data,
  cascade,
  assumptions,
  unitsGoal,
  onUnitsGoalChange,
  selectedProduct,
}: {
  data: ApiData;
  cascade: CascadeUnit | null;
  assumptions: Assumptions;
  unitsGoal: number;
  onUnitsGoalChange: (n: number) => void;
  selectedProduct: ProductUnitEconomics | null;
}) {
  // Cassia 2026-06-11: KPIs do topo referem ao produto selecionado.
  // Return rate: usa direto product.returnRate30d (real 30d), com fallback pra cascade
  // Unidades: selectedProduct.totalUnits no D-1 + orders do produto
  // Marketing Total: marketingPct × effectiveUnits × pricePerUnit do produto
  const returnRateValue =
    selectedProduct?.returnRate30d ?? cascade?.returnRate ?? 0;
  const returnTotal = selectedProduct?.returnTotalQty30d ?? 0;
  const returnRefunded = selectedProduct?.returnRefundedQty30d ?? 0;
  // Exchange rate (Exchange-Only) é separado de returns. Ambos mostrados pra clareza.
  const exchangeRateValue = selectedProduct?.exchangeRate ?? 0;
  const returnTone: Tone =
    returnRateValue > 0.08 ? 'danger' : returnRateValue > 0.05 ? 'warn' : 'neutral';
  const mcRealPositive = cascade ? cascade.netCmReal > 0 : false;
  const mcPremPositive = cascade ? cascade.netCmAssumption > 0 : false;

  const productUnits = selectedProduct?.totalUnits ?? 0;
  const productOrders = selectedProduct?.totalOrders ?? 0;
  const pricePerUnit = selectedProduct?.unitGrossRevenue ?? 0;
  const effectiveUnits = unitsGoal > 0 ? unitsGoal : productUnits;
  const projectedRevenue = effectiveUnits * pricePerUnit;
  const marketingPremissa = assumptions.marketingPct * projectedRevenue;
  const marketingPremissaPerUnit = assumptions.marketingPct * pricePerUnit;
  const usingGoal = unitsGoal > 0;

  return (
    <section className="mt-6">
      <div className="kpi-grid-auto">
        <KpiCard
          label="GROSS CM / un"
          value={cascade ? fmt(cascade.grossContributionMargin, data.currency) : '—'}
          sub={cascade ? `${pct(cascade.gcmPctOfRevenue)} of revenue` : ''}
          tone="neutral"
        />
        <KpiCard
          label="NET CM REAL / un"
          value={cascade ? fmt(cascade.netCmReal, data.currency) : '—'}
          sub={cascade ? `Real marketing: ${fmt(cascade.marketingReal, data.currency)}` : ''}
          tone={mcRealPositive ? 'success' : 'danger'}
        />
        <KpiCard
          label="NET CM ASSUMED / un"
          value={cascade ? fmt(cascade.netCmAssumption, data.currency) : '—'}
          sub={cascade ? `Marketing %: ${fmt(cascade.marketingAssumption, data.currency)}` : ''}
          tone={mcPremPositive ? 'success' : 'danger'}
        />
        <KpiCard
          label="RETURNS (30D)"
          value={pct(returnRateValue, 2)}
          sub={
            returnTotal > 0
              ? `${returnRefunded.toLocaleString()} of ${returnTotal.toLocaleString()} un · Exchanges: ${pct(exchangeRateValue, 1)}`
              : `No returns · Exchanges: ${pct(exchangeRateValue, 1)}`
          }
          tone={returnTone}
        />
        <UnitsGoalCard
          actual={productUnits}
          orders={productOrders}
          market={data.market || 'US'}
          locale={data.currency === 'USD' ? 'en-US' : 'pt-BR'}
          onGoalChange={onUnitsGoalChange}
        />
        <KpiCard
          label="TOTAL MARKETING"
          value={fmt(marketingPremissa, data.currency, { compact: true })}
          sub={`${pct(assumptions.marketingPct)} × ${effectiveUnits.toLocaleString()} units (${usingGoal ? 'target' : 'actual'}) · ${fmt(marketingPremissaPerUnit, data.currency)}/un · Real: ${fmt(data.totalMarketingSpend, data.currency, { compact: true })}`}
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
    <div className="kpi-card-uniform" style={{ borderTop: `3px solid ${t.label}` }}>
      <div className="kpi-label" style={{ color: t.label }}>
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// Card UNIDADES com input editável de meta + atingimento %
function UnitsGoalCard({
  actual,
  orders,
  market,
  locale,
  onGoalChange,
}: {
  actual: number;
  orders: number;
  market: Market;
  locale: string;
  onGoalChange: (n: number) => void;
}) {
  const STORAGE_KEY = `lpos-ue-units-goal-${market}`;
  const [goalStr, setGoalStr] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v) {
        setGoalStr(v);
        const n = parseInt(v.replace(/\D/g, ''), 10);
        onGoalChange(Number.isFinite(n) && n > 0 ? n : 0);
      } else {
        onGoalChange(0);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STORAGE_KEY]);

  function save(v: string) {
    setGoalStr(v);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, v);
      } catch {}
    }
    const n = parseInt(v.replace(/\D/g, ''), 10);
    onGoalChange(Number.isFinite(n) && n > 0 ? n : 0);
  }

  const goal = parseInt(goalStr.replace(/\D/g, ''), 10);
  const hasGoal = Number.isFinite(goal) && goal > 0;
  const attainment = hasGoal ? actual / goal : 0;
  const tone: Tone =
    !hasGoal ? 'info' : attainment >= 1 ? 'success' : attainment >= 0.7 ? 'warn' : 'danger';
  const t = TONE[tone];

  return (
    <div className="kpi-card-uniform" style={{ borderTop: `3px solid ${t.label}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="kpi-label" style={{ color: t.label }}>
          UNITS SOLD YESTERDAY
        </div>
        {hasGoal && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: t.label, color: '#fff' }}
          >
            {(attainment * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="kpi-value">{actual.toLocaleString(locale)}</div>
      <div className="kpi-sub flex items-center gap-1.5">
        <span>Target:</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="—"
          value={goalStr}
          onChange={(e) => save(e.target.value)}
          className="flex-1 min-w-0 text-[11px] font-semibold border rounded px-1.5 py-0.5 outline-none focus:border-pink-400"
          style={{ borderColor: '#e5e3de', color: '#111827', background: '#fafafa', maxWidth: 80 }}
          title="Sales units target for the day"
        />
        <span className="opacity-70">· {orders.toLocaleString(locale)} ord.</span>
      </div>
    </div>
  );
}

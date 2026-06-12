'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Market } from '@/lib/unit-economics/queries';

interface Candidate {
  motherSku: string;
  productName: string;
  listPrice: number;
  currentPrice: number;
  unitCogs: number;
  units28d: number;
  orders28d: number;
  revenue28d: number;
  avgPricePaid28d: number;
  pixShare28d: number;
  returnRate30d: number;
  exchangeRate30d: number;
  grossMarginPct: number;
  score: number;
}

interface ApiResponse {
  market: Market;
  currency: 'USD' | 'BRL';
  startDate: string;
  endDate: string;
  totalUnits28d: number;
  totalOrders28d: number;
  totalRevenue28d: number;
  pixShareOverall28d: number;
  partial: boolean;
  candidates: Candidate[];
  durationMs: number;
}

function fmt(value: number, currency: 'USD' | 'BRL', compact: boolean = false): string {
  const symbol = currency === 'USD' ? '$' : 'R$';
  if (compact) {
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

const STATE_KEY = 'lpos-apostar-state-v1';

interface State {
  market: Market;
  selectedSku: string | null;
  metaUnits: number;
  prazoDias: number;
  roas: number;
  descontoPct: number;
  cupomPct: number;
  pixDescontoPct: number;
  fulfillmentPerUnit: number;
  shippingPerUnit: number;
  cardFeePct: number;
}

const defaultState: State = {
  market: 'US',
  selectedSku: null,
  metaUnits: 1000,
  prazoDias: 5,
  roas: 3,
  descontoPct: 0,
  cupomPct: 0,
  pixDescontoPct: 0.15,
  fulfillmentPerUnit: 8,
  shippingPerUnit: 12,
  cardFeePct: 0.025,
};

export default function Dashboard() {
  const [state, setState] = useState<State>(defaultState);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<State>;
        setState((s) => ({ ...s, ...saved }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state]);

  // Quando muda market, ajusta defaults BR
  function changeMarket(m: Market) {
    setState((s) => ({
      ...s,
      market: m,
      selectedSku: null,
      fulfillmentPerUnit: m === 'US' ? 8 : 15,
      shippingPerUnit: m === 'US' ? 12 : 25,
      pixDescontoPct: m === 'BR' ? 0.15 : 0,
    }));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/produtos-apostar/${state.market}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
        if (!state.selectedSku && json.candidates?.[0]) {
          setState((s) => ({ ...s, selectedSku: json.candidates[0].motherSku }));
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.market]);

  const selected = useMemo(() => {
    if (!data) return null;
    return data.candidates.find((c) => c.motherSku === state.selectedSku) ?? data.candidates[0] ?? null;
  }, [data, state.selectedSku]);

  // Calculadora do produto selecionado
  const calc = useMemo(() => {
    if (!selected || !data) return null;
    const listPrice = selected.listPrice;
    const baseDiscount = listPrice * state.descontoPct;
    const priceAfterBase = listPrice - baseDiscount;
    const coupon = priceAfterBase * state.cupomPct;
    const priceAfterCoupon = priceAfterBase - coupon;
    // PIX blend (BR)
    const pixShare = state.market === 'BR' ? selected.pixShare28d : 0;
    const pixDisc = state.market === 'BR' ? state.pixDescontoPct : 0;
    const effectiveRevenue = priceAfterCoupon * (pixShare * (1 - pixDisc) + (1 - pixShare));
    const nonPixPortion = priceAfterCoupon * (1 - pixShare);
    const cardFee = nonPixPortion * state.cardFeePct;
    const cogs = selected.unitCogs;
    const shipping = state.shippingPerUnit;
    const fulfillment = state.fulfillmentPerUnit;
    const exchange = selected.exchangeRate30d * (shipping + fulfillment);
    const mcbPerUnit = effectiveRevenue - cogs - cardFee - shipping - fulfillment - exchange;
    const receitaProjetada = effectiveRevenue * state.metaUnits;
    const investimento = state.roas > 0 ? receitaProjetada / state.roas : 0;
    const mktPerUnit = state.metaUnits > 0 ? investimento / state.metaUnits : 0;
    const mclPerUnit = mcbPerUnit - mktPerUnit;
    const mcbTotal = mcbPerUnit * state.metaUnits;
    const mclTotal = mclPerUnit * state.metaUnits;
    const cogsTotal = cogs * state.metaUnits;
    const unitsPerDay = state.prazoDias > 0 ? state.metaUnits / state.prazoDias : 0;
    const unitsPerDayCurrent = selected.units28d / 28;
    const upliftPct = unitsPerDayCurrent > 0 ? unitsPerDay / unitsPerDayCurrent - 1 : 0;
    return {
      listPrice,
      baseDiscount,
      coupon,
      priceAfterCoupon,
      effectiveRevenue,
      cogs,
      cardFee,
      shipping,
      fulfillment,
      exchange,
      mcbPerUnit,
      mktPerUnit,
      mclPerUnit,
      receitaProjetada,
      investimento,
      mcbTotal,
      mclTotal,
      cogsTotal,
      unitsPerDay,
      unitsPerDayCurrent,
      upliftPct,
      pixShare,
    };
  }, [selected, data, state]);

  const currency = data?.currency ?? 'USD';

  return (
    <div>
      <header className="mb-6 no-print-bg">
        <div className="pt-8 pb-2 flex items-start justify-between gap-4 flex-wrap">
          <h1
            className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
          >
            Products to Bet On
          </h1>
        </div>
        <div className="pb-3 flex items-center gap-2 no-print">
          {(['US', 'BR'] as const).map((m) => {
            const active = state.market === m;
            return (
              <button
                key={m}
                onClick={() => changeMarket(m)}
                className={`inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all px-3 sm:px-4 py-1.5 ${
                  active
                    ? 'bg-[#ec4899] text-white'
                    : 'bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0]'
                }`}
              >
                <span className="opacity-70 mr-1.5 text-[10px]">{m}</span>
                {m === 'US' ? 'United States' : 'Brazil'}
              </button>
            );
          })}
        </div>
        <p className="text-sm pb-4" style={{ color: 'var(--ink-soft)' }}>
          Product suggestions based on the <strong>last 28 days</strong> performance
          {data && (
            <span style={{ color: 'var(--ink)' }}>
              {' '}({data.startDate} → {data.endDate}) · {data.totalUnits28d.toLocaleString()}{' '}
              units sold in the period
            </span>
          )}
        </p>
      </header>

      {/* Disclaimer da fórmula do score */}
      <details
        className="rounded-2xl mb-6"
        style={{ background: '#fffbeb', border: '0.8px solid #fed7aa' }}
      >
        <summary
          className="cursor-pointer p-4 text-[12px] font-semibold flex items-center gap-2 select-none"
          style={{ color: '#92400e' }}
        >
          <span>ℹ️ How the Score is calculated</span>
          <span className="text-[10px] font-normal opacity-70">(click to expand)</span>
        </summary>
        <div className="px-4 pb-4 text-[12px] space-y-2" style={{ color: '#78350f' }}>
          <div
            className="font-mono text-[11px] p-2 rounded"
            style={{ background: '#fff', border: '1px solid #fed7aa' }}
          >
            score = units_28d (excl. Exchange-Only) × grossMarginPct × (1 − returnRate30d)
          </div>
          <ul className="space-y-1 pl-4 list-disc">
            <li>
              <strong>units_28d (regular)</strong> — DTC units sold in the last 28 days,
              <strong> excluding orders tagged Exchange-Only</strong>. Exchange-Only orders are
              CX operational (customer swapping another product) and don't respond to marketing
              campaigns — they shouldn't inflate the ranking.
            </li>
            <li>
              <strong>grossMarginPct</strong> — (28d avg price paid − catalog COGS) / avg price.
              Unit efficiency BEFORE marketing/shipping/fulfillment.
            </li>
            <li>
              <strong>(1 − returnRate30d)</strong> — penalizes refunds. Metric =
              refunds_qty / total_qty in the last 30 days.
            </li>
          </ul>
          <div className="text-[11px] italic opacity-90 pt-1">
            ⚠ <strong>Disclaimer:</strong> the score is a heuristic, not a guaranteed return.
            Past volume doesn't guarantee future volume — scenario may change with seasonality,
            inventory, campaign mix and price. The calculator on the right projects the financial
            scenario GIVEN the inputs (target, ROAS, discounts); the team must judge operational
            feasibility (available stock, fulfillment capacity, realistic timeline). Doesn't
            include fixed costs, salaries, tools or direct taxes.
          </div>
        </div>
      </details>

      {error && (
        <div
          className="p-4 rounded-2xl"
          style={{ border: '0.8px solid #b3382f', background: '#fff5f5', color: '#b3382f' }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}
      {loading && !data && (
        <div
          className="p-8 text-center text-sm rounded-2xl"
          style={{ background: '#fff', border: '0.8px solid #e5e3de', color: '#6b7280' }}
        >
          Loading candidates from Shopify (28d)...
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6 mt-6">
          {/* Lista de candidatos */}
          <aside
            className="p-4 sm:p-5 rounded-2xl"
            style={{ background: '#fff', border: '0.8px solid #e5e3de' }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>
              Top 30 Candidates (by score)
            </div>
            <div className="overflow-y-auto thin-scroll" style={{ maxHeight: 700 }}>
              {data.candidates.slice(0, 30).map((c, idx) => {
                const isActive = c.motherSku === state.selectedSku;
                return (
                  <button
                    key={c.motherSku}
                    onClick={() => setState((s) => ({ ...s, selectedSku: c.motherSku }))}
                    className="w-full text-left p-2 rounded-lg mb-1 transition-all"
                    style={{
                      background: isActive ? '#fdf2f8' : 'transparent',
                      border: `1px solid ${isActive ? '#ec4899' : 'transparent'}`,
                    }}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-bold" style={{ color: '#9ca3af' }}>
                        #{idx + 1}
                      </span>
                      <span className="text-[12px] font-semibold flex-1 truncate" style={{ color: '#111827' }}>
                        {c.productName}
                      </span>
                    </div>
                    <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ color: '#6b7280' }}>
                      <span>{c.units28d.toLocaleString()} units</span>
                      <span>·</span>
                      <span>{pct(c.grossMarginPct, 0)} margin</span>
                      <span>·</span>
                      <span>{fmt(c.avgPricePaid28d, currency)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Calculadora */}
          <div className="space-y-6">
            {selected && calc && (
              <>
                {/* Header do produto */}
                <section
                  className="p-5 rounded-2xl"
                  style={{ background: '#fff', border: '0.8px solid #e5e3de' }}
                >
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-xs font-mono" style={{ color: '#9ca3af' }}>
                        {selected.motherSku}
                      </div>
                      <div className="text-lg font-bold mt-0.5">{selected.productName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#9ca3af' }}>
                        Score
                      </div>
                      <div className="text-2xl font-bold" style={{ color: '#ec4899' }}>
                        {Math.round(selected.score).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3 text-[12px]">
                    <Mini label="Sold 28d" value={`${selected.units28d.toLocaleString()} units`} />
                    <Mini label="Gross margin" value={pct(selected.grossMarginPct, 1)} />
                    <Mini label="Returns 30d" value={pct(selected.returnRate30d, 1)} />
                  </div>
                </section>

                {/* Inputs da aposta */}
                <section
                  className="p-5 rounded-2xl"
                  style={{ background: '#fff', border: '0.8px solid #e5e3de' }}
                >
                  <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#ec4899' }}>
                    🎯 Bet Parameters
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                    <Field
                      label="Units target"
                      value={state.metaUnits}
                      onChange={(n) => setState((s) => ({ ...s, metaUnits: n }))}
                      step={50}
                    />
                    <Field
                      label="Timeline (days)"
                      value={state.prazoDias}
                      onChange={(n) => setState((s) => ({ ...s, prazoDias: n }))}
                      step={1}
                    />
                    <Field
                      label="Target ROAS"
                      value={state.roas}
                      onChange={(n) => setState((s) => ({ ...s, roas: n }))}
                      step={0.1}
                    />
                    <Field
                      label="Discount %"
                      value={state.descontoPct * 100}
                      onChange={(n) => setState((s) => ({ ...s, descontoPct: n / 100 }))}
                      step={1}
                    />
                    <Field
                      label="Extra coupon %"
                      value={state.cupomPct * 100}
                      onChange={(n) => setState((s) => ({ ...s, cupomPct: n / 100 }))}
                      step={1}
                    />
                    {state.market === 'BR' && (
                      <Field
                        label="PIX discount %"
                        value={state.pixDescontoPct * 100}
                        onChange={(n) => setState((s) => ({ ...s, pixDescontoPct: n / 100 }))}
                        step={1}
                      />
                    )}
                    <Field
                      label={`Fulfillment ${currency === 'USD' ? '$' : 'R$'}/un`}
                      value={state.fulfillmentPerUnit}
                      onChange={(n) => setState((s) => ({ ...s, fulfillmentPerUnit: n }))}
                      step={1}
                    />
                    <Field
                      label={`Shipping ${currency === 'USD' ? '$' : 'R$'}/un`}
                      value={state.shippingPerUnit}
                      onChange={(n) => setState((s) => ({ ...s, shippingPerUnit: n }))}
                      step={1}
                    />
                  </div>
                </section>

                {/* Projeção */}
                <section
                  className="p-5 rounded-2xl"
                  style={{ background: '#fff', border: '0.8px solid #e5e3de' }}
                >
                  <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#ec4899' }}>
                    📊 Bet Projection
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                    <Big
                      label="Total investment"
                      value={fmt(calc.investimento, currency, true)}
                      sub={`ROAS ${state.roas} · ${fmt(calc.mktPerUnit, currency)}/un`}
                      tone="alert"
                    />
                    <Big
                      label="Projected revenue"
                      value={fmt(calc.receitaProjetada, currency, true)}
                      sub={`${state.metaUnits.toLocaleString()} units × ${fmt(calc.effectiveRevenue, currency)}`}
                      tone="info"
                    />
                    <Big
                      label="Total gross CM"
                      value={fmt(calc.mcbTotal, currency, true)}
                      sub={`${fmt(calc.mcbPerUnit, currency)}/un`}
                      tone={calc.mcbTotal > 0 ? 'success' : 'danger'}
                    />
                    <Big
                      label="Total net CM"
                      value={fmt(calc.mclTotal, currency, true)}
                      sub={`${fmt(calc.mclPerUnit, currency)}/un · after mkt`}
                      tone={calc.mclTotal > 0 ? 'success' : 'danger'}
                    />
                    <Big
                      label="Units/day"
                      value={Math.round(calc.unitsPerDay).toLocaleString()}
                      sub={`Today: ${calc.unitsPerDayCurrent.toFixed(1)}/day · ${calc.upliftPct > 0 ? '+' : ''}${pct(calc.upliftPct, 0)}`}
                      tone="info"
                    />
                    <Big
                      label="Effective price"
                      value={fmt(calc.effectiveRevenue, currency)}
                      sub={`From ${fmt(calc.listPrice, currency)}${state.market === 'BR' && calc.pixShare > 0 ? ` · PIX ${pct(calc.pixShare, 0)}` : ''}`}
                      tone="neutral"
                    />
                    <Big
                      label="Total COGS"
                      value={fmt(calc.cogsTotal, currency, true)}
                      sub={`${fmt(calc.cogs, currency)}/un`}
                      tone="neutral"
                    />
                    <Big
                      label="Net margin"
                      value={
                        calc.effectiveRevenue > 0
                          ? pct(calc.mclPerUnit / calc.effectiveRevenue, 1)
                          : '—'
                      }
                      sub="Net CM / Revenue"
                      tone={calc.mclPerUnit > 0 ? 'success' : 'danger'}
                    />
                  </div>

                  {/* Verdict */}
                  <div className="mt-4 p-3 rounded-lg" style={{ background: '#f9fafb' }}>
                    <div className="text-[12px]" style={{ color: '#374151' }}>
                      {calc.mclTotal > 0 ? (
                        <>
                          ✅ <strong>Profitable bet:</strong> investing{' '}
                          {fmt(calc.investimento, currency)} at ROAS {state.roas}, projection of{' '}
                          {fmt(calc.mclTotal, currency)} Net CM in {state.prazoDias} days.
                          Volume {pct(calc.upliftPct, 0)}{' '}
                          {calc.upliftPct > 0 ? 'above' : 'below'} 28d baseline.
                        </>
                      ) : (
                        <>
                          ⚠ <strong>Bet in the red:</strong> even at ROAS {state.roas}, Net CM
                          would be {fmt(calc.mclTotal, currency)}. Review: cut discount, raise
                          target ROAS, or negotiate COGS.
                        </>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: '#f9fafb' }}>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>
        {label}
      </div>
      <div className="font-bold mt-0.5" style={{ color: '#111827' }}>
        {value}
      </div>
    </div>
  );
}

const TONE: Record<string, { label: string; border: string }> = {
  neutral: { label: '#6b7280', border: '#e5e3de' },
  success: { label: '#10b981', border: '#d1fae5' },
  danger: { label: '#dc2626', border: '#fee2e2' },
  info: { label: '#7c3aed', border: '#ede9fe' },
  alert: { label: '#ea580c', border: '#fed7aa' },
};

function Big({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'success' | 'danger' | 'info' | 'alert';
}) {
  const t = TONE[tone];
  return (
    <div
      className="rounded-2xl flex flex-col"
      style={{ border: `1px solid ${t.border}`, padding: '16px 14px', minHeight: 110, background: '#fff' }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[0.08em] leading-tight"
        style={{ color: t.label }}
      >
        {label}
      </div>
      <div
        className="font-bold leading-none mt-2"
        style={{ color: '#111827', fontSize: 'clamp(20px, 2.2vw, 28px)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-2 leading-tight" style={{ color: '#9ca3af' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step ?? 1}
        className="px-2 py-1.5 rounded-md text-[13px]"
        style={{
          border: '1px solid #e5e3de',
          background: '#fff',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    </label>
  );
}

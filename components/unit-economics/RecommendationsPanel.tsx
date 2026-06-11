'use client';

/**
 * Recomendações Unit Economics — cenários de DESCONTO.
 *
 * Cassia 2026-06-11: "altere os cenários de desconto para 30%, 40%, 50% e 60%"
 *
 * Para o produto selecionado, simula cascata com discountPct = 30/40/50/60
 * e mostra a margem resultante + se atinge o alvo do market:
 *   - BR: alvo break-even (margem 0%)
 *   - US: alvo 30% margem
 */

import { useMemo } from 'react';
import { computeCascade, type Assumptions, type CascadeUnit } from '@/lib/unit-economics/cascade';
import type { ProductUnitEconomics, Market } from '@/lib/unit-economics/queries';

interface Props {
  product: ProductUnitEconomics | null;
  cascade: CascadeUnit | null;
  market: Market;
  assumptions: Assumptions;
  marketingPerUnitReal: number;
  currency: 'USD' | 'BRL';
}

function fmt(value: number, currency: 'USD' | 'BRL'): string {
  const symbol = currency === 'USD' ? '$' : 'R$';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${symbol}${abs.toLocaleString(currency === 'USD' ? 'en-US' : 'pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: abs < 10 ? 2 : 0,
  })}`;
}
function pct(v: number, digits: number = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

const DISCOUNT_SCENARIOS = [0.3, 0.4, 0.5, 0.6];

export default function RecommendationsPanel({
  product,
  cascade,
  market,
  assumptions,
  marketingPerUnitReal,
  currency,
}: Props) {
  if (!product || !cascade) {
    return (
      <section className="card mt-6 p-3 sm:p-5">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ec4899' }}>
          📊 Discount Scenarios
        </div>
        <div className="text-[12px] mt-2" style={{ color: '#6b7280' }}>
          Select a product to see scenarios.
        </div>
      </section>
    );
  }

  const targetMargin = market === 'US' ? 0.3 : 0;
  const targetLabel = market === 'US' ? '≥ 30% margin' : 'break-even (0%)';

  // Cenário "real" sem desconto extra — referência
  const realScenario = useMemo(() => {
    const c = computeCascade(product, assumptions, market, marketingPerUnitReal);
    const margin = c.effectiveRevenue > 0 ? c.netCmAssumption / c.effectiveRevenue : 0;
    return { cascade: c, margin };
  }, [product, assumptions, market, marketingPerUnitReal]);

  // Cenários de desconto
  const scenarios = useMemo(() => {
    return DISCOUNT_SCENARIOS.map((discountPct) => {
      const overriddenAssumptions: Assumptions = { ...assumptions, discountPct };
      const c = computeCascade(product, overriddenAssumptions, market, marketingPerUnitReal);
      const margin = c.effectiveRevenue > 0 ? c.netCmAssumption / c.effectiveRevenue : 0;
      const passes = margin >= targetMargin;
      return {
        discountPct,
        cascade: c,
        margin,
        passes,
      };
    });
  }, [product, assumptions, market, marketingPerUnitReal, targetMargin]);

  return (
    <section className="card mt-6 p-3 sm:p-5">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ec4899' }}>
          📊 Discount Scenarios — {market} · Target: {targetLabel}
        </div>
        <div className="text-[12px] mt-1" style={{ color: '#374151' }}>
          Product: <strong>{product.productName}</strong>
          <span className="ml-2 text-[11px]" style={{ color: '#9ca3af' }}>
            ({product.totalUnits} un · list price {fmt(product.unitGrossRevenue, currency)} ·
            COGS {fmt(product.unitCogs, currency)})
          </span>
        </div>
        <div className="text-[11px] mt-1" style={{ color: '#6b7280' }}>
          Current scenario: margin{' '}
          <strong style={{ color: realScenario.margin >= targetMargin ? '#10b981' : '#dc2626' }}>
            {pct(realScenario.margin, 1)}
          </strong>{' '}
          · Net CM Assumed {fmt(realScenario.cascade.netCmAssumption, currency)}/un.
          {market === 'US'
            ? ' US needs at least 30%.'
            : ' BR can operate at break-even (any positive Net CM).'}
        </div>
      </div>

      {/* Cards de cenários */}
      <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {scenarios.map((s) => {
          const tone = s.passes ? '#10b981' : s.margin >= targetMargin - 0.05 ? '#d97706' : '#dc2626';
          const bg = s.passes ? '#f0fdf4' : '#fff';
          const border = s.passes ? '#86efac' : '#e5e3de';
          return (
            <div
              key={s.discountPct}
              className="rounded-2xl p-4"
              style={{ border: `1.5px solid ${border}`, background: bg }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: '#6b7280' }}
                >
                  Discount {pct(s.discountPct, 0)}
                </span>
                {s.passes ? (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: '#10b981', color: '#fff' }}
                  >
                    OK
                  </span>
                ) : (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: '#dc2626', color: '#fff' }}
                  >
                    BELOW
                  </span>
                )}
              </div>

              <div
                className="font-bold mt-2"
                style={{ color: tone, fontSize: 'clamp(20px, 2vw, 28px)' }}
              >
                {pct(s.margin, 1)}
              </div>
              <div className="text-[11px]" style={{ color: '#6b7280' }}>
                resulting margin
              </div>

              <div className="mt-3 text-[11px] space-y-0.5" style={{ color: '#374151' }}>
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>Final price:</span>
                  <strong>{fmt(s.cascade.effectiveRevenue, currency)}</strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>Gross CM/un:</span>
                  <strong>{fmt(s.cascade.grossContributionMargin, currency)}</strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>Net CM Asm:</span>
                  <strong style={{ color: tone }}>
                    {fmt(s.cascade.netCmAssumption, currency)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>Marketing:</span>
                  <span>{fmt(s.cascade.marketingAssumption, currency)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Next steps */}
      <div className="mt-5 p-3 rounded-lg" style={{ background: '#f9fafb' }}>
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: '#6b7280' }}
        >
          Diagnostic — {product.productName}
        </div>
        <ul className="mt-2 text-[12px] space-y-1.5" style={{ color: '#374151' }}>
          {scenarios.filter((s) => s.passes).length === 0 && (
            <li>
              ⚠ No discount scenario (30-60%) hits the target {pct(targetMargin, 0)}.
              Need to <strong>raise price, reduce COGS</strong> or review costs before
              running any promotion.
            </li>
          )}
          {scenarios.filter((s) => s.passes).length > 0 && (
            <li>
              ✓ Max viable discount:{' '}
              <strong>
                {pct(
                  Math.max(...scenarios.filter((s) => s.passes).map((s) => s.discountPct)),
                  0
                )}
              </strong>{' '}
              (keeping margin ≥ {pct(targetMargin, 0)}).
            </li>
          )}
          {market === 'BR' && product.pixShare > 0.5 && (
            <li>
              • PIX share {pct(product.pixShare, 1)}: card-fee savings allow more aggressive
              discounts than the default calc.
            </li>
          )}
          {product.exchangeRate != null && product.exchangeRate > 0.3 && (
            <li>
              • <strong>Exchange-Only</strong> rate {pct(product.exchangeRate, 1)} is high —
              <em> a distinct metric from returns</em>. Be careful with promotions that scale
              volume without ensured fit.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

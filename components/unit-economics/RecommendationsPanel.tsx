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
      <section className="card mt-6 p-5">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ec4899' }}>
          📊 Cenários de Desconto
        </div>
        <div className="text-[12px] mt-2" style={{ color: '#6b7280' }}>
          Selecione um produto pra ver os cenários.
        </div>
      </section>
    );
  }

  const targetMargin = market === 'US' ? 0.3 : 0;
  const targetLabel = market === 'US' ? '≥ 30% margem' : 'break-even (0%)';

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
    <section className="card mt-6 p-5">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ec4899' }}>
          📊 Cenários de Desconto — {market} · Alvo: {targetLabel}
        </div>
        <div className="text-[12px] mt-1" style={{ color: '#374151' }}>
          Produto: <strong>{product.productName}</strong>
          <span className="ml-2 text-[11px]" style={{ color: '#9ca3af' }}>
            ({product.totalUnits} un · preço de lista {fmt(product.unitGrossRevenue, currency)} ·
            COGS {fmt(product.unitCogs, currency)})
          </span>
        </div>
        <div className="text-[11px] mt-1" style={{ color: '#6b7280' }}>
          Cenário atual: margem{' '}
          <strong style={{ color: realScenario.margin >= targetMargin ? '#10b981' : '#dc2626' }}>
            {pct(realScenario.margin, 1)}
          </strong>{' '}
          · MC Líq Premissa {fmt(realScenario.cascade.netCmAssumption, currency)}/un.
          {market === 'US'
            ? ' US precisa de 30% mínimo.'
            : ' BR pode operar em break-even (qualquer MCL positiva).'}
        </div>
      </div>

      {/* Cards de cenários */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
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
                  Desconto {pct(s.discountPct, 0)}
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
                    ABAIXO
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
                margem resultante
              </div>

              <div className="mt-3 text-[11px] space-y-0.5" style={{ color: '#374151' }}>
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>Preço final:</span>
                  <strong>{fmt(s.cascade.effectiveRevenue, currency)}</strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>MCB/un:</span>
                  <strong>{fmt(s.cascade.grossContributionMargin, currency)}</strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>MC Líq Prem:</span>
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

      {/* Próximos passos */}
      <div className="mt-5 p-3 rounded-lg" style={{ background: '#f9fafb' }}>
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: '#6b7280' }}
        >
          Diagnóstico — {product.productName}
        </div>
        <ul className="mt-2 text-[12px] space-y-1.5" style={{ color: '#374151' }}>
          {scenarios.filter((s) => s.passes).length === 0 && (
            <li>
              ⚠ Nenhum cenário de desconto (30-60%) atinge o alvo {pct(targetMargin, 0)}.
              Precisa <strong>subir preço, reduzir COGS</strong> ou revisar custos antes de
              aplicar promoção.
            </li>
          )}
          {scenarios.filter((s) => s.passes).length > 0 && (
            <li>
              ✓ Desconto máximo viável:{' '}
              <strong>
                {pct(
                  Math.max(...scenarios.filter((s) => s.passes).map((s) => s.discountPct)),
                  0
                )}
              </strong>{' '}
              (mantendo margem ≥ {pct(targetMargin, 0)}).
            </li>
          )}
          {market === 'BR' && product.pixShare > 0.5 && (
            <li>
              • PIX share {pct(product.pixShare, 1)}: economia de taxa cartão permite descontos
              mais agressivos do que o cálculo padrão.
            </li>
          )}
          {product.exchangeRate != null && product.exchangeRate > 0.3 && (
            <li>
              • Taxa de troca {pct(product.exchangeRate, 1)} alta: cuidado com promoções que
              aumentem volume sem fit garantido.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

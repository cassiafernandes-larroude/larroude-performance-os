'use client';

/**
 * Recomendações Unit Economics — POR PRODUTO SELECIONADO.
 *
 * Cassia 2026-06-11:
 *   "considerando que para BR podemos chegar em margem 0% e US precisamos
 *    de 30% de margem (no caso de US, inclua cenários com 15%, 20% e 30%)"
 *   "o quadro recomendações deve ser relacionado ao produto selecionado"
 *
 * Para o produto selecionado e cada TARGET margin %:
 *   MCB_target = target × effRev
 *   marketing_máximo_pct = (MCB / effRev) − target
 *   gap_atual = netCmAssumption − target × effRev
 *
 * Quando o produto não atinge o target, calcula 3 alavancas:
 *   1. Subir preço em X% (mantendo COGS)
 *   2. Reduzir COGS em X% (mantendo preço)
 *   3. Reduzir marketingPct em X pontos
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

interface ScenarioRow {
  target: number;
  isPrincipal: boolean;
  margin: number;
  passes: boolean;
  gap: number; // valor $/un acima/abaixo do target
  maxMarketingPct: number; // % de marketing máximo possível dado o GCM atual
  priceUpNeeded: number | null; // % aumento preço pra atingir
  cogsDownNeeded: number | null; // % redução COGS pra atingir
  marketingDownNeededPts: number | null; // pontos % redução em marketingPct
}

function computeScenario(
  product: ProductUnitEconomics,
  assumptions: Assumptions,
  market: Market,
  marketingPerUnitReal: number,
  target: number,
  isPrincipal: boolean
): ScenarioRow {
  const c = computeCascade(product, assumptions, market, marketingPerUnitReal);
  const effRev = c.effectiveRevenue;
  const margin = effRev > 0 ? c.netCmAssumption / effRev : 0;
  const passes = margin >= target;
  const gap = c.netCmAssumption - target * effRev;

  // marketingPct_máximo: quando MCL_premissa = target × effRev → marketing = MCB - target×effRev
  const maxMarketingPct = effRev > 0 ? (c.grossContributionMargin - target * effRev) / effRev : 0;

  // Alavancas pra atingir target (apenas calcula se NÃO atinge atualmente):
  let priceUpNeeded: number | null = null;
  let cogsDownNeeded: number | null = null;
  let marketingDownNeededPts: number | null = null;
  if (!passes) {
    // 1. Subir preço: assume que aumento de preço Δp aumenta receita e mantém custos fixos.
    //    Δp × (1 - marketingPct) ≈ gap necessário
    //    Δp / basePrice = % aumento
    const denom = 1 - assumptions.marketingPct;
    if (denom > 0 && c.basePrice > 0) {
      priceUpNeeded = -gap / (c.basePrice * denom);
    }
    // 2. Reduzir COGS: Δ_cogs = -gap → % redução = gap/cogs
    if (c.cogs > 0) {
      cogsDownNeeded = -gap / c.cogs;
    }
    // 3. Reduzir marketingPct: Δ_marketing × effRev = -gap → Δpct = -gap/effRev
    if (effRev > 0) {
      marketingDownNeededPts = -gap / effRev;
    }
  }

  return {
    target,
    isPrincipal,
    margin,
    passes,
    gap,
    maxMarketingPct,
    priceUpNeeded,
    cogsDownNeeded,
    marketingDownNeededPts,
  };
}

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
          📊 Recomendações
        </div>
        <div className="text-[12px] mt-2" style={{ color: '#6b7280' }}>
          Selecione um produto pra ver as recomendações.
        </div>
      </section>
    );
  }

  const principalTarget = market === 'US' ? 0.3 : 0;
  const targets: { value: number; isPrincipal: boolean }[] =
    market === 'US'
      ? [
          { value: 0.15, isPrincipal: false },
          { value: 0.2, isPrincipal: false },
          { value: 0.3, isPrincipal: true },
        ]
      : [{ value: 0, isPrincipal: true }];

  const scenarios = useMemo(
    () =>
      targets.map((t) =>
        computeScenario(product, assumptions, market, marketingPerUnitReal, t.value, t.isPrincipal)
      ),
    [product, assumptions, market, marketingPerUnitReal, targets]
  );

  const principal = scenarios.find((s) => s.isPrincipal)!;
  const targetLabel = market === 'US' ? '≥ 30% margem' : 'break-even (0%)';

  return (
    <section className="card mt-6 p-5">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ec4899' }}>
          📊 Recomendações — {market} · Alvo: {targetLabel}
        </div>
        <div className="text-[12px] mt-1" style={{ color: '#374151' }}>
          Produto: <strong>{product.productName}</strong>
          <span className="ml-2 text-[11px]" style={{ color: '#9ca3af' }}>
            ({product.totalUnits} un · preço médio {fmt(product.unitGrossRevenue, currency)} · COGS{' '}
            {fmt(product.unitCogs, currency)})
          </span>
        </div>
        <div className="text-[11px] mt-1" style={{ color: '#6b7280' }}>
          {market === 'US'
            ? 'US precisa de 30% de margem mínima. Cenários 15% e 20% como diagnóstico.'
            : 'BR pode operar em break-even (margem 0%) — qualquer MC Líquida positiva é ganho.'}
        </div>
      </div>

      {/* Cards de cenários */}
      <div className={`grid gap-3 ${market === 'US' ? 'grid-cols-3' : 'grid-cols-1'}`}>
        {scenarios.map((s) => {
          const tone = s.passes ? '#10b981' : s.margin >= s.target - 0.05 ? '#d97706' : '#dc2626';
          const bg = s.isPrincipal ? '#fdf2f8' : '#fff';
          const border = s.isPrincipal ? '#ec4899' : '#e5e3de';
          return (
            <div
              key={s.target}
              className="rounded-2xl p-4"
              style={{ border: `1.5px solid ${border}`, background: bg }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: '#6b7280' }}
                >
                  {market === 'US' ? `Cenário ${pct(s.target, 0)}` : 'Break-even'}
                </span>
                {s.isPrincipal && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: '#ec4899', color: '#fff' }}
                  >
                    PRINCIPAL
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
                margem atual{' '}
                {s.passes ? (
                  <span style={{ color: '#10b981', fontWeight: 600 }}>✓ atinge</span>
                ) : (
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>✗ abaixo</span>
                )}
              </div>

              <div className="mt-3 text-[11px] space-y-0.5" style={{ color: '#374151' }}>
                <div>
                  Gap: <strong>{fmt(s.gap, currency)}/un</strong>
                </div>
                <div>
                  Mkt máximo:{' '}
                  <strong>{s.maxMarketingPct > 0 ? pct(s.maxMarketingPct, 1) : '—'}</strong>
                </div>
              </div>

              {!s.passes && (
                <div
                  className="mt-3 text-[10.5px] space-y-0.5 pt-2"
                  style={{ borderTop: '1px dashed #e5e3de', color: '#6b7280' }}
                >
                  <div className="font-semibold uppercase tracking-wider text-[9px] mb-1">
                    Pra atingir:
                  </div>
                  {s.priceUpNeeded !== null && s.priceUpNeeded > 0 && s.priceUpNeeded < 1 && (
                    <div>
                      ↑ preço <strong>+{pct(s.priceUpNeeded, 1)}</strong>
                    </div>
                  )}
                  {s.cogsDownNeeded !== null && s.cogsDownNeeded > 0 && s.cogsDownNeeded < 1 && (
                    <div>
                      ↓ COGS <strong>−{pct(s.cogsDownNeeded, 1)}</strong>
                    </div>
                  )}
                  {s.marketingDownNeededPts !== null && s.marketingDownNeededPts > 0 && (
                    <div>
                      ↓ marketing <strong>−{pct(s.marketingDownNeededPts, 1)} pts</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recomendações táticas para esse produto */}
      <div className="mt-5 p-3 rounded-lg" style={{ background: '#f9fafb' }}>
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: '#6b7280' }}
        >
          Diagnóstico — {product.productName}
        </div>
        <ul className="mt-2 text-[12px] space-y-1.5" style={{ color: '#374151' }}>
          {principal.passes ? (
            <li>
              ✅ Esse produto <strong>atinge</strong> o alvo {pct(principalTarget, 0)} —
              margem atual {pct(principal.margin, 1)}. Candidato a escalar com mais ad spend
              (mkt máximo: {pct(principal.maxMarketingPct, 1)}).
            </li>
          ) : (
            <>
              <li>
                ⚠ Esse produto <strong>NÃO atinge</strong> o alvo {pct(principalTarget, 0)} —
                margem atual {pct(principal.margin, 1)} · gap {fmt(principal.gap, currency)}/un.
              </li>
              {market === 'US' && principal.margin < 0.15 && (
                <li>
                  • Margem abaixo de 15%: <strong>revisar preço, reduzir desconto</strong>, ou
                  descontinuar.
                </li>
              )}
              {market === 'US' && principal.margin >= 0.15 && principal.margin < 0.3 && (
                <li>
                  • Margem entre 15-30%: <strong>cortar marketing dirigido</strong> e priorizar
                  tráfego orgânico/email.
                </li>
              )}
              {market === 'BR' && principal.margin < 0 && (
                <li>
                  • MC Líquida negativa: <strong>subir preço, reduzir COGS</strong> ou eliminar do
                  catálogo.
                </li>
              )}
              {product.pixShare > 0.5 && market === 'BR' && (
                <li>
                  • PIX share {pct(product.pixShare, 1)}: aproveitar a economia de cartão pra
                  promo agressiva e ganhar volume.
                </li>
              )}
              {product.exchangeRate != null && product.exchangeRate > 0.3 && (
                <li>
                  • Taxa de troca alta ({pct(product.exchangeRate, 1)}): investigar
                  fit/qualidade pra reduzir REDOs.
                </li>
              )}
            </>
          )}
        </ul>
      </div>
    </section>
  );
}

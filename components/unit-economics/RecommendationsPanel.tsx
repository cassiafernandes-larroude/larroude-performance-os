'use client';

/**
 * Recomendações Unit Economics.
 *
 * Cassia 2026-06-11:
 *   "considerando que para BR podemos chegar em margem 0% e US precisamos
 *    de 30% de margem (no caso de US, inclua cenários com 15%, 20% e 30%)"
 *
 * Cálculo por produto:
 *   MC Líq Premissa / un = MC Bruta / un − marketingPct × effectiveRevenue
 *   Margem % = MC Líq Premissa / un / effectiveRevenue
 *
 * Para um TARGET margin %:
 *   marketingPct_máximo = (MC Bruta / effRev) − target
 *   Ou seja, qto sobra pra marketing depois de tirar o alvo de margem.
 */

import { useMemo } from 'react';
import { computeCascade, type Assumptions } from '@/lib/unit-economics/cascade';
import type { ProductUnitEconomics, Market } from '@/lib/unit-economics/queries';

interface Props {
  products: ProductUnitEconomics[];
  market: Market;
  assumptions: Assumptions;
  marketingPerUnitReal: number;
  currency: 'USD' | 'BRL';
}

function fmt(value: number, currency: 'USD' | 'BRL'): string {
  const symbol = currency === 'USD' ? '$' : 'R$';
  return `${symbol}${value.toLocaleString(currency === 'USD' ? 'en-US' : 'pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
  })}`;
}
function pct(v: number, digits: number = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

interface Stats {
  total: number;
  passing: number;
  failing: number;
  passingPct: number;
  avgGap: number; // diff médio entre MCL real e target ($/un)
}

function computeStatsForTarget(
  products: ProductUnitEconomics[],
  assumptions: Assumptions,
  market: Market,
  marketingPerUnitReal: number,
  targetMargin: number
): Stats {
  let passing = 0;
  let total = 0;
  let sumGap = 0;
  for (const p of products) {
    // ignora produtos sem preço (catálogo zero)
    if (!p.unitGrossRevenue || p.unitGrossRevenue <= 0) continue;
    const c = computeCascade(p, assumptions, market, marketingPerUnitReal);
    const effRev = c.effectiveRevenue;
    if (effRev <= 0) continue;
    const actualMargin = c.netCmAssumption / effRev;
    const targetCm = targetMargin * effRev;
    const gap = c.netCmAssumption - targetCm; // > 0 = passa
    total++;
    sumGap += gap;
    if (actualMargin >= targetMargin) passing++;
  }
  return {
    total,
    passing,
    failing: total - passing,
    passingPct: total > 0 ? passing / total : 0,
    avgGap: total > 0 ? sumGap / total : 0,
  };
}

export default function RecommendationsPanel({
  products,
  market,
  assumptions,
  marketingPerUnitReal,
  currency,
}: Props) {
  // Targets por mercado:
  // BR: break-even (margem 0%)
  // US: 30% (principal), com cenários adicionais 15% e 20%
  const scenarios = market === 'US' ? [0.15, 0.2, 0.3] : [0];

  const stats = useMemo(() => {
    return scenarios.map((target) => ({
      target,
      ...computeStatsForTarget(products, assumptions, market, marketingPerUnitReal, target),
    }));
  }, [products, market, assumptions, marketingPerUnitReal, scenarios]);

  // Encontra TOP/BOTTOM produtos pelo target principal
  const principalTarget = market === 'US' ? 0.3 : 0;
  const productsWithMargin = useMemo(() => {
    return products
      .filter((p) => p.unitGrossRevenue > 0 && p.totalUnits > 0)
      .map((p) => {
        const c = computeCascade(p, assumptions, market, marketingPerUnitReal);
        const margin = c.effectiveRevenue > 0 ? c.netCmAssumption / c.effectiveRevenue : 0;
        return { product: p, cascade: c, margin };
      });
  }, [products, assumptions, market, marketingPerUnitReal]);

  const losers = useMemo(
    () =>
      [...productsWithMargin]
        .filter((p) => p.margin < principalTarget)
        .sort((a, b) => a.margin - b.margin)
        .slice(0, 5),
    [productsWithMargin, principalTarget]
  );
  const winners = useMemo(
    () =>
      [...productsWithMargin]
        .filter((p) => p.margin >= principalTarget)
        .sort((a, b) => b.margin - a.margin)
        .slice(0, 5),
    [productsWithMargin, principalTarget]
  );

  const targetLabel = market === 'US' ? '≥ 30% margem' : 'break-even (0%)';

  return (
    <section className="card mt-6 p-5">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ec4899' }}>
          📊 Recomendações — {market} · Alvo: {targetLabel}
        </div>
        <div className="text-[11px] mt-1" style={{ color: '#6b7280' }}>
          {market === 'US'
            ? 'US precisa de 30% de margem mínima. Cenários intermediários 15% e 20% como diagnóstico.'
            : 'BR pode operar em break-even (margem 0%) — qualquer MC Líquida positiva é ganho.'}{' '}
          MC Líq Premissa = MCB − marketingPct × receita.
        </div>
      </div>

      {/* Cenários por target */}
      <div className={`grid gap-3 ${market === 'US' ? 'grid-cols-3' : 'grid-cols-1'}`}>
        {stats.map((s) => {
          const isPrincipal = s.target === principalTarget;
          const passRate = s.passingPct;
          const tone =
            passRate >= 0.7 ? '#10b981' : passRate >= 0.4 ? '#d97706' : '#dc2626';
          return (
            <div
              key={s.target}
              className="rounded-2xl p-4"
              style={{
                border: `1.5px solid ${isPrincipal ? '#ec4899' : '#e5e3de'}`,
                background: isPrincipal ? '#fdf2f8' : '#fff',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6b7280' }}>
                  {market === 'US' ? `Cenário ${pct(s.target, 0)}` : 'Break-even'}
                </span>
                {isPrincipal && (
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
                {s.passing}/{s.total}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#6b7280' }}>
                {pct(passRate, 1)} dos SKUs atingem
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#9ca3af' }}>
                Gap médio: {s.avgGap >= 0 ? '+' : ''}{fmt(s.avgGap, currency)}/un
              </div>
            </div>
          );
        })}
      </div>

      {/* TOP perdedores */}
      {losers.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#dc2626' }}>
            ⚠ Produtos abaixo do alvo ({targetLabel}) — Top 5 piores
          </div>
          <div className="mt-2 grid gap-1.5">
            {losers.map(({ product, cascade, margin }) => (
              <div
                key={product.motherSku}
                className="flex items-center justify-between text-[12px] px-3 py-2 rounded-lg"
                style={{ background: '#fef2f2' }}
              >
                <div className="flex-1 min-w-0 truncate" style={{ color: '#111827' }}>
                  <span className="font-semibold">{product.productName}</span>
                  <span className="ml-2 text-[10px]" style={{ color: '#9ca3af' }}>
                    {product.totalUnits} un
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>{pct(margin, 1)}</span>
                  <span className="text-[10px]" style={{ color: '#6b7280' }}>
                    MCL: {fmt(cascade.netCmAssumption, currency)}/un
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOP winners */}
      {winners.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#10b981' }}>
            ✓ Produtos acima do alvo — Top 5 melhores
          </div>
          <div className="mt-2 grid gap-1.5">
            {winners.map(({ product, cascade, margin }) => (
              <div
                key={product.motherSku}
                className="flex items-center justify-between text-[12px] px-3 py-2 rounded-lg"
                style={{ background: '#f0fdf4' }}
              >
                <div className="flex-1 min-w-0 truncate" style={{ color: '#111827' }}>
                  <span className="font-semibold">{product.productName}</span>
                  <span className="ml-2 text-[10px]" style={{ color: '#9ca3af' }}>
                    {product.totalUnits} un
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{pct(margin, 1)}</span>
                  <span className="text-[10px]" style={{ color: '#6b7280' }}>
                    MCL: {fmt(cascade.netCmAssumption, currency)}/un
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendações táticas */}
      <div className="mt-5 p-3 rounded-lg" style={{ background: '#f9fafb' }}>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6b7280' }}>
          Próximos passos
        </div>
        <ul className="mt-2 text-[12px] space-y-1.5" style={{ color: '#374151' }}>
          {market === 'US' && (
            <>
              <li>
                • SKUs <strong>abaixo de 15%</strong>: revisar preço, reduzir desconto, ou
                descontinuar.
              </li>
              <li>
                • SKUs entre <strong>15-30%</strong>: cortar marketing dirigido (campanhas que
                puxam % alta) e priorizar tráfego orgânico/email.
              </li>
              <li>
                • SKUs <strong>acima de 30%</strong>: candidatos a escalar com mais ad spend.
              </li>
            </>
          )}
          {market === 'BR' && (
            <>
              <li>
                • SKUs <strong>negativos</strong>: subir preço, reduzir COGS, ou eliminar do
                catálogo.
              </li>
              <li>
                • SKUs com PIX share alto (&gt;50%): aproveitar a economia de cartão pra subir
                desconto promocional e ganhar volume.
              </li>
              <li>
                • Marketing pode ser mais agressivo: break-even = qualquer MC Líquida positiva
                é lucro contribuído.
              </li>
            </>
          )}
        </ul>
      </div>
    </section>
  );
}

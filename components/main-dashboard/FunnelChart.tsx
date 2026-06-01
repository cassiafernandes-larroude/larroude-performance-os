'use client';

import type { FunnelSteps, Market } from '@/lib/main-dashboard/types';
import { fmtCurrency, fmtNumber, fmtPercent, safeDiv } from '@/lib/main-dashboard/utils';

interface Props {
  funnel: FunnelSteps;
  market: Market;
  revenue?: number;
}

export default function FunnelChart({ funnel, market, revenue = 0 }: Props) {
  const { sessions, addToCart, checkouts, purchases } = funnel;
  const cvr = safeDiv(purchases, sessions);

  // 5 etapas: SESSÕES → ATC → CHECKOUT → COMPRAS → CVR FINAL
  // % é em relação à ETAPA ANTERIOR (taxa de conversão entre etapas)
  // Exceção: CVR FINAL é relativo às sessões (métrica global)
  const atcRate = safeDiv(addToCart, sessions);       // ATC / Sessões
  const checkoutRate = safeDiv(checkouts, addToCart); // Checkout / ATC
  const purchasesRate = safeDiv(purchases, checkouts);// Compras / Checkout
  const steps = [
    {
      key: 'sessions',
      label: 'SESSÕES',
      value: fmtNumber(sessions),
      pct: 1,
      pctText: '100%',
      icon: '👥',
    },
    {
      key: 'atc',
      label: 'ATC',
      value: fmtNumber(addToCart),
      pct: atcRate,
      pctText: fmtPercent(atcRate, 2),
      icon: '🛒',
    },
    {
      key: 'checkout',
      label: 'CHECKOUT',
      value: fmtNumber(checkouts),
      pct: checkoutRate,
      pctText: fmtPercent(checkoutRate, 2),
      icon: '✓',
    },
    {
      key: 'purchases',
      label: 'COMPRAS',
      value: fmtNumber(purchases),
      pct: purchasesRate,
      pctText: fmtPercent(purchasesRate, 2),
      icon: '🛍️',
    },
    {
      key: 'cvr',
      label: 'CVR FINAL',
      value: cvr > 0 ? fmtPercent(cvr, 2) : '—',
      pct: cvr,
      pctText: revenue > 0 ? fmtCurrency(revenue, market, { compact: true }) : '',
      icon: '📊',
      isFinal: true,
    },
  ];

  return (
    <section className="card mt-4 p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-ink mb-4">
        Conversões por etapa
      </div>

      <div className="funnel-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {steps.map((s, i) => (
          <div key={s.key} className="relative">
            <div className={`card p-4 ${s.isFinal ? 'border-accent/30' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${
                  s.isFinal ? 'bg-accent-soft text-accent' : 'bg-cloud text-ink'
                }`}>
                  {s.icon}
                </div>
                <span className="text-[10px] font-bold tracking-wider text-steel uppercase">
                  {s.label}
                </span>
              </div>
              <div className="text-2xl font-bold text-ink leading-tight">{s.value}</div>
              {/* Barra rosa proporcional */}
              <div className="mt-2.5 h-1 bg-cloud rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${Math.max(Math.min(s.pct * 100, 100), 1)}%` }}
                />
              </div>
              <div className="text-[10px] text-steel mt-1.5">
                {s.isFinal ? s.pctText : s.pctText}
              </div>
            </div>
            {/* Seta entre os cards (não exibe no último em mobile/lg) */}
            {i < steps.length - 1 && (
              <div className="hidden lg:flex absolute top-1/2 -right-2 transform -translate-y-1/2 z-10 w-4 h-4 items-center justify-center text-steel-soft">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

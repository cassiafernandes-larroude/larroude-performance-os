'use client';

import KpiCard from './KpiCard';
import type { KpiValue, Market } from '@/lib/main-dashboard/types';

interface Props { kpis: KpiValue[]; market: Market; }

export default function KpiGrid({ kpis, market }: Props) {
  return (
    <section className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-ink tracking-wide">
          {market === 'US' ? '🇺🇸 UNITED STATES' : '🇧🇷 BRAZIL'}
        </h2>
        <span className="text-[10px] font-bold px-2 py-0.5 bg-accent-soft text-accent rounded-full uppercase">
          {market === 'US' ? 'USD' : 'BRL'}
        </span>
      </div>
      <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>
    </section>
  );
}

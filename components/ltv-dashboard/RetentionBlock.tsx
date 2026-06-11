'use client';

import type { Market, RetentionStats } from '@/lib/ltv-dashboard/queries';
import { formatNumber, formatPercent } from '@/lib/ltv-dashboard/format';
import KpiCard from './KpiCard';

/**
 * Bloco de métricas de retenção ABSOLUTAS — não dependem da janela escolhida.
 * Refletem o comportamento real do cliente ao longo de toda sua vida.
 */
export default function RetentionBlock({
  retention,
  market,
}: {
  retention: RetentionStats | undefined;
  market: Market;
}) {
  return (
    <div className="kpi-grid">
      <KpiCard
        label="Returning Rate (lifetime)"
        value={retention ? formatPercent(retention.returningRateAllTime) : '—'}
        sub={
          retention
            ? `${formatNumber(retention.lifetimeCustomers, market)} unique customers in history`
            : '% customers with ≥ 2 orders in history'
        }
        highlight
      />
      <KpiCard
        label="Repeat purchase 90 days"
        value={retention ? formatPercent(retention.repeat90d) : '—'}
        sub="% customers whose 2nd purchase happened within 90 days of the 1st"
      />
      <KpiCard
        label="Repeat purchase 12 months"
        value={retention ? formatPercent(retention.repeat12m) : '—'}
        sub="% customers whose 2nd purchase happened within 365 days of the 1st"
      />
      <KpiCard
        label="Annual Purchase Frequency"
        value={retention ? retention.purchaseFrequencyAnnual.toFixed(2) : '—'}
        sub="orders ÷ customers over the last 12 months"
        highlight
      />
    </div>
  );
}

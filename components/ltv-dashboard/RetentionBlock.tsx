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
        label="Returning Rate (vida toda)"
        value={retention ? formatPercent(retention.returningRateAllTime) : '—'}
        sub={
          retention
            ? `${formatNumber(retention.lifetimeCustomers, market)} clientes únicos no histórico`
            : '% clientes com ≥ 2 pedidos no histórico'
        }
        highlight
      />
      <KpiCard
        label="Repeat purchase 90 dias"
        value={retention ? formatPercent(retention.repeat90d) : '—'}
        sub="% clientes cuja 2ª compra ocorreu em até 90 dias da 1ª"
      />
      <KpiCard
        label="Repeat purchase 12 meses"
        value={retention ? formatPercent(retention.repeat12m) : '—'}
        sub="% clientes cuja 2ª compra ocorreu em até 365 dias da 1ª"
      />
      <KpiCard
        label="Purchase frequency anual"
        value={retention ? retention.purchaseFrequencyAnnual.toFixed(2) : '—'}
        sub="orders ÷ customers nos últimos 12 meses"
        highlight
      />
    </div>
  );
}

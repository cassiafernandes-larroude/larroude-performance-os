'use client';

// Channel Share KPI cards - top section showing each channel's share of total revenue
// (% participation in the period total) + absolute revenue amount.

import type { DashboardPayload, Market } from '@/lib/main-dashboard/types';

interface Props { data: DashboardPayload; }

function fmtCurrency(value: number, market: Market): string {
  const symbol = market === 'US' ? '$' : 'R$';
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  return `${symbol}${Math.round(value)}`;
}

export default function ChannelShareKpis({ data }: Props) {
  const { market, channels } = data;
  if (!channels || channels.length === 0) return null;

  // channels ja vem ordenado por receita decrescente do dashboard-service.
  // pct ja vem calculado (channel.revenue / grandTotal).
  return (
    <section className="mt-2 mb-2">
      <div className="text-xs font-bold uppercase tracking-[0.15em] text-ink mb-3 flex items-center gap-2.5">
        <span className="inline-block w-1 h-4 bg-accent rounded-full" />
        SHARE BY CHANNEL - {market}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 lg:gap-3">
        {channels.map((ch) => {
          const sharePct = (ch.pct ?? 0) * 100;
          return (
            <div
              key={ch.channel}
              className="rounded-xl p-3 bg-white"
              style={{ border: '0.8px solid #e5e3de', borderTop: `3px solid ${ch.color ?? '#64748b'}` }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-wide mb-1 truncate"
                style={{ color: '#6b7280' }}
                title={ch.channel}
              >
                {ch.channel}
              </div>
              <div
                className="font-num text-[22px] lg:text-[24px] font-bold leading-tight"
                style={{ color: 'var(--ink)' }}
              >
                {sharePct.toFixed(1)}%
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#9ca3af' }}>
                {fmtCurrency(ch.revenue, market)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

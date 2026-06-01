'use client';

import type { ChannelRevenue, Market, TopCampaignRoas } from '@/lib/main-dashboard/types';
import { fmtCurrency, fmtMultiple, fmtPercent } from '@/lib/main-dashboard/utils';

interface Props { channels: ChannelRevenue[]; topCampaigns: TopCampaignRoas[]; market: Market; }

export default function ChannelBreakdown({ channels, topCampaigns, market }: Props) {
  const maxRevenue = Math.max(1, ...channels.map((c) => c.revenue));
  const maxRoas = Math.max(1, ...topCampaigns.map((c) => c.roas));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      <div className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-steel mb-4">
          Receita por canal · {market}
        </div>
        <div className="space-y-2.5">
          {channels.length === 0 && <div className="text-sm text-steel italic">Sem dados de canal no período.</div>}
          {channels.map((c) => (
            <div key={c.channel} className="grid grid-cols-12 items-center gap-3">
              <div className="col-span-3 text-xs text-ink truncate text-right pr-1">{c.channel}</div>
              <div className="col-span-6 h-5 bg-cloud rounded-md overflow-hidden">
                <div className="h-full rounded-md" style={{ width: `${(c.revenue / maxRevenue) * 100}%`, background: c.color }} />
              </div>
              <div className="col-span-3 text-xs font-medium text-ink whitespace-nowrap">
                {fmtCurrency(c.revenue, market, { compact: true })} · {fmtPercent(c.pct)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-steel mb-4">
          ROAS por campanha · TOP 10 (purchase_value / spend)
        </div>
        <div className="space-y-2.5">
          {topCampaigns.length === 0 && <div className="text-sm text-steel italic">Sem campanhas no período.</div>}
          {topCampaigns.map((c) => {
            const platformBadge = c.platform === 'Google'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-blue-100 text-blue-700';
            return (
              <div key={`${c.platform ?? 'Meta'}-${c.campaign}`} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-5 text-xs text-ink truncate text-right pr-1" title={c.campaign}>
                  <span className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${platformBadge}`}>
                    {c.platform ?? 'Meta'}
                  </span>
                  {c.campaign}
                </div>
                <div className="col-span-5 h-5 bg-cloud rounded-md overflow-hidden">
                  <div className="h-full rounded-md bg-bar-orange" style={{ width: `${(c.roas / maxRoas) * 100}%` }} />
                </div>
                <div className="col-span-2 text-xs font-bold text-ink">{fmtMultiple(c.roas)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

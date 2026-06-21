'use client';

import type { ChannelCost, ChannelRevenue, Market, TopCampaignRoas } from '@/lib/main-dashboard/types';
import { fmtCurrency, fmtMultiple, fmtPercent } from '@/lib/main-dashboard/utils';
import { consolidateOrganicChannels } from '@/lib/shared/channel-consolidation';

interface Props {
  channels: ChannelRevenue[];
  topCampaigns: TopCampaignRoas[];
  channelCosts?: ChannelCost[]; // Cassia 2026-06-14: opcional pra retro-compat — card Cost by Channel
  market: Market;
}

export default function ChannelBreakdown({ channels, topCampaigns, channelCosts = [], market }: Props) {
  // Consolidação via helper compartilhado (mesmo código usado no Channel Share)
  const displayChannels = consolidateOrganicChannels(channels);
  const maxRevenue = Math.max(1, ...displayChannels.map((c) => c.revenue));
  const maxRoas = Math.max(1, ...topCampaigns.map((c) => c.roas));
  // Cost by Channel — Cassia 2026-06-14 (restaurado de lgeral)
  const totalCost = channelCosts.reduce((s, c) => s + c.cost, 0);
  const maxCost = Math.max(1, ...channelCosts.map((c) => c.cost));

  return (
    <>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-steel mb-4">
            Revenue by channel · {market}
          </div>
          <div className="space-y-2.5">
            {displayChannels.length === 0 && <div className="text-sm text-steel italic">No channel data in this period.</div>}
            {displayChannels.map((c) => (
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

        {/* Cost by Channel — restaurado Cassia 2026-06-14 (estava no source lgeral mas não foi copiado pra lpos) */}
        <div className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-steel mb-1">
            Cost by channel · {market}
          </div>
          <div className="text-[11px] text-steel mb-4">
            Total: {fmtCurrency(totalCost, market, { compact: true })} · Meta + Google + tools/platforms
          </div>
          <div className="space-y-2.5">
            {channelCosts.length === 0 && (
              <div className="text-sm text-steel italic">No costs registered for this period.</div>
            )}
            {channelCosts.map((c) => {
              const pct = totalCost > 0 ? (c.cost / totalCost) * 100 : 0;
              return (
                <div key={c.channel} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-4 text-xs text-ink truncate text-right pr-1" title={c.channel}>
                    <span
                      className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: c.color + '22', color: c.color }}
                    >
                      {c.category}
                    </span>
                    {c.channel}
                  </div>
                  <div className="col-span-5 h-5 bg-cloud rounded-md overflow-hidden">
                    <div
                      className="h-full rounded-md"
                      style={{ width: `${(c.cost / maxCost) * 100}%`, background: c.color }}
                    />
                  </div>
                  <div className="col-span-3 text-xs font-medium text-ink whitespace-nowrap">
                    {fmtCurrency(c.cost, market, { compact: true })} · {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ROAS por campanha (TOP 10) — fica em row separada agora, ocupando largura toda */}
      <section className="mt-4">
        <div className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-steel mb-4">
            ROAS by campaign · TOP 10 (purchase_value / spend)
          </div>
          <div className="space-y-2.5">
            {topCampaigns.length === 0 && <div className="text-sm text-steel italic">No campaigns in this period.</div>}
            {topCampaigns.map((c) => {
              const platformBadge = c.platform === 'Google'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-blue-100 text-blue-700';
              return (
                <div key={`${c.platform ?? 'Meta'}-${c.campaign}`} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-5 text-xs text-ink truncate text-right pr-1" title={c.campaign} data-no-translate="true">
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
    </>
  );
}

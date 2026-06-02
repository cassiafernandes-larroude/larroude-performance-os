'use client';

// Channel Share grid: para cada canal, renderiza 2 graficos diarios:
//   1. Faturamento (currency)
//   2. Participacao (% do total daily)
// Reusa DailyBarChart e os dados de daily.channel_{slug} ja existentes no payload.

import type { DashboardPayload, DailyPoint } from '@/lib/main-dashboard/types';
import DailyBarChart from './DailyBarChart';
import ChannelShareInsights from './ChannelShareInsights';

interface Props { data: DashboardPayload; dimmed?: boolean; }

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-bold uppercase tracking-[0.15em] text-ink mt-8 mb-4 flex items-center gap-2.5">
    <span className="inline-block w-1 h-4 bg-accent rounded-full" />
    {children}
  </div>
);

// Mesmo mapping de slug do Dashboard.tsx
function slugFor(channel: string): string {
  if (channel === 'Sem UTM / Direto') return 'sem_utm_direto';
  if (channel === 'Meta Ads') return 'meta_ads';
  if (channel === 'Google Ads') return 'google_ads';
  if (channel === 'Klaviyo Email') return 'klaviyo_email';
  if (channel === 'SMS Attentive') return 'sms_attentive';
  if (channel === 'Awin Affiliate') return 'awin_affiliate';
  if (channel === 'ShopMy') return 'shopmy';
  if (channel === 'Criteo') return 'criteo';
  if (channel === 'Agent.shop') return 'agent_shop';
  if (channel === 'Organico Social (IG)') return 'organico_social_ig';
  if (channel === 'Orgânico Social (IG)') return 'organico_social_ig';
  return 'outros';
}

export default function ChannelShareGrid({ data, dimmed }: Props) {
  const { market, daily, channels } = data;

  // Dedup por slug
  const seen = new Set<string>();
  const uniqueChannels = channels.filter((ch) => {
    const slug = slugFor(ch.channel);
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });

  // Pre-calcula total diario somando todos os canais
  // Map date -> total revenue across all channels
  const totalsByDate = new Map<string, number>();
  for (const ch of uniqueChannels) {
    const slug = slugFor(ch.channel);
    const series: DailyPoint[] = (daily as any)[`channel_${slug}`] ?? [];
    for (const pt of series) {
      totalsByDate.set(pt.date, (totalsByDate.get(pt.date) ?? 0) + (pt.value ?? 0));
    }
  }

  // Helper - cria serie de participacao (% do total daily) para um canal
  function shareSeries(channel: string): DailyPoint[] {
    const slug = slugFor(channel);
    const series: DailyPoint[] = (daily as any)[`channel_${slug}`] ?? [];
    return series.map((pt) => {
      const total = totalsByDate.get(pt.date) ?? 0;
      const share = total > 0 ? pt.value / total : 0;
      return { date: pt.date, value: share, inPeriod: pt.inPeriod };
    });
  }

  return (
    <div className={`transition-opacity ${dimmed ? 'opacity-60' : 'opacity-100'}`}>
      <SectionHeader>📊 CHANNEL SHARE - {market} - DAILY REVENUE AND SHARE</SectionHeader>
      <p className="text-sm text-steel mt-2 mb-4">
        Daily revenue per channel (left) and percent share of that channel in the daily total (right).
        Same filters as the Main Dashboard: excludes B2B, wholesale, marketplace, redo and orders above the per-market cap.
      </p>

      <div className="space-y-6">
        {uniqueChannels.map((ch) => {
          const slug = slugFor(ch.channel);
          const revenueSeries: DailyPoint[] = (daily as any)[`channel_${slug}`] ?? [];
          if (revenueSeries.length === 0) return null;
          const share = shareSeries(ch.channel);
          return (
            <div key={slug} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DailyBarChart
                title={`${ch.channel} - Revenue`}
                data={revenueSeries}
                color={ch.color ?? '#64748b'}
                unit="currency"
                market={market}
              />
              <DailyBarChart
                title={`${ch.channel} - Share (%)`}
                data={share}
                color={ch.color ?? '#64748b'}
                unit="percent"
                market={market}
              />
            </div>
          );
        })}
      </div>

      {/* Auto-computed insights at the bottom */}
      <ChannelShareInsights data={data} />
    </div>
  );
}

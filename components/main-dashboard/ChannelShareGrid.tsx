'use client';

// Channel Share grid: para cada canal, renderiza 2 graficos diarios:
//   1. Faturamento (currency)
//   2. Participacao (% do total daily)
// Reusa DailyBarChart e os dados de daily.channel_{slug} ja existentes no payload.

import type { DashboardPayload, DailyPoint, ChannelRevenue } from '@/lib/main-dashboard/types';
import DailyBarChart from './DailyBarChart';
import ChannelShareInsights from './ChannelShareInsights';
import ChannelShareKpis from './ChannelShareKpis';

// Consolida "Orgânico Search" + "Orgânico Social" em um único "Orgânico".
// Aplica em channels (totais) E daily.channel_organico_search + _social → daily.channel_organico.
function consolidateOrganic(data: DashboardPayload): DashboardPayload {
  const organicLabels = new Set(['Orgânico Search', 'Orgânico Social', 'Organico Search', 'Organico Social']);
  let organicRev = 0;
  let organicPct = 0;
  const otherChannels: ChannelRevenue[] = [];
  for (const c of data.channels) {
    if (organicLabels.has(c.channel)) {
      organicRev += c.revenue;
      organicPct += c.pct ?? 0;
    } else {
      otherChannels.push(c);
    }
  }
  const newChannels = [...otherChannels];
  if (organicRev > 0) {
    newChannels.push({ channel: 'Orgânico', revenue: organicRev, pct: organicPct, color: '#22c55e' });
  }
  newChannels.sort((a, b) => b.revenue - a.revenue);

  // Consolida daily.channel_organico_search + _social em daily.channel_organico
  const dailyAny = data.daily as any;
  const searchDaily: DailyPoint[] = dailyAny.channel_organico_search ?? [];
  const socialDaily: DailyPoint[] = dailyAny.channel_organico_social ?? [];
  const byDate = new Map<string, DailyPoint>();
  for (const pt of [...searchDaily, ...socialDaily]) {
    const cur = byDate.get(pt.date);
    if (cur) {
      cur.value += pt.value ?? 0;
    } else {
      byDate.set(pt.date, { date: pt.date, value: pt.value ?? 0, inPeriod: pt.inPeriod });
    }
  }
  const organicSeries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Cria novo daily map sem as series antigas + com a nova consolidada
  const newDaily: any = { ...dailyAny };
  delete newDaily.channel_organico_search;
  delete newDaily.channel_organico_social;
  if (organicSeries.length > 0) newDaily.channel_organico = organicSeries;

  return { ...data, channels: newChannels, daily: newDaily };
}

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
  if (channel === 'Orgânico' || channel === 'Organico') return 'organico';
  if (channel === 'Orgânico Search' || channel === 'Organico Search') return 'organico_search';
  if (channel === 'Orgânico Social' || channel === 'Organico Social') return 'organico_social';
  // legacy
  if (channel === 'Orgânico Social (IG)' || channel === 'Organico Social (IG)') return 'organico_social_ig';
  return 'outros';
}

export default function ChannelShareGrid({ data: rawData, dimmed }: Props) {
  // Consolida Organico Search + Organico Social em um unico Organico (channels + daily)
  const data = consolidateOrganic(rawData);
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
      {/* Top KPI cards: share % of each channel in total revenue */}
      <ChannelShareKpis data={data} />

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

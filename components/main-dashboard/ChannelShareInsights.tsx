'use client';

// Channel Share Insights - automatic insights computed from the same data
// already loaded by ChannelShareGrid. No extra API call, no LLM cost.
//
// Insights computed:
//   1. Top channel by total revenue
//   2. Top channel by average daily share
//   3. Fastest grower (first half vs second half of period)
//   4. Channel concentration (top 3 channels = X% of total)
//   5. Most stable channel (lowest std dev of daily share)
//   6. Direct / no-attribution alert (if "Sem UTM / Direto" > 40%)

import type { DashboardPayload, DailyPoint, Market } from '@/lib/main-dashboard/types';

interface Props { data: DashboardPayload; }

type InsightTone = 'good' | 'info' | 'warn';

interface Insight {
  tone: InsightTone;
  icon: string;
  title: string;
  body: string;
}

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

function fmtCurrency(value: number, market: Market): string {
  const symbol = market === 'US' ? '$' : 'R$';
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  return `${symbol}${Math.round(value)}`;
}

function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, n) => s + (n - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function computeInsights(data: DashboardPayload): Insight[] {
  const { market, daily, channels } = data;

  // Dedup channels
  const seen = new Set<string>();
  const uniqueChannels = channels.filter((ch) => {
    const slug = slugFor(ch.channel);
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });

  // Build per-channel daily series + total revenue
  const perChannel: Array<{
    channel: string;
    revenue: number;
    series: DailyPoint[];
    dailyShares: number[]; // share[i] for each day
    firstHalfRev: number;
    secondHalfRev: number;
  }> = [];

  // Build date -> total revenue across all channels
  const totalsByDate = new Map<string, number>();
  for (const ch of uniqueChannels) {
    const slug = slugFor(ch.channel);
    const series: DailyPoint[] = (daily as any)[`channel_${slug}`] ?? [];
    for (const pt of series) {
      totalsByDate.set(pt.date, (totalsByDate.get(pt.date) ?? 0) + (pt.value ?? 0));
    }
  }

  const dateList = Array.from(totalsByDate.keys()).sort();
  const midpoint = Math.floor(dateList.length / 2);
  const firstHalfDates = new Set(dateList.slice(0, midpoint));
  const secondHalfDates = new Set(dateList.slice(midpoint));

  for (const ch of uniqueChannels) {
    const slug = slugFor(ch.channel);
    const series: DailyPoint[] = (daily as any)[`channel_${slug}`] ?? [];
    let revenue = 0;
    let firstHalfRev = 0;
    let secondHalfRev = 0;
    const dailyShares: number[] = [];
    for (const pt of series) {
      const v = pt.value ?? 0;
      revenue += v;
      if (firstHalfDates.has(pt.date)) firstHalfRev += v;
      if (secondHalfDates.has(pt.date)) secondHalfRev += v;
      const total = totalsByDate.get(pt.date) ?? 0;
      if (total > 0) dailyShares.push(v / total);
    }
    perChannel.push({ channel: ch.channel, revenue, series, dailyShares, firstHalfRev, secondHalfRev });
  }

  const grandTotal = perChannel.reduce((s, c) => s + c.revenue, 0);
  const insights: Insight[] = [];

  // 1. Top channel by total revenue
  const byRevenue = [...perChannel].sort((a, b) => b.revenue - a.revenue);
  const topRev = byRevenue[0];
  if (topRev && grandTotal > 0) {
    const sharePct = topRev.revenue / grandTotal;
    insights.push({
      tone: 'info',
      icon: '🏆',
      title: `${topRev.channel} leads revenue`,
      body: `${fmtCurrency(topRev.revenue, market)} in the period, ${fmtPct(sharePct)} of total revenue.`,
    });
  }

  // 2. Top channel by average daily share (different from total revenue if volume varies a lot per day)
  const byAvgShare = [...perChannel].sort((a, b) => mean(b.dailyShares) - mean(a.dailyShares));
  const topShare = byAvgShare[0];
  if (topShare && topShare.channel !== topRev?.channel) {
    insights.push({
      tone: 'info',
      icon: '📊',
      title: `${topShare.channel} has highest daily share`,
      body: `Average share of ${fmtPct(mean(topShare.dailyShares))} of daily revenue — different from the top revenue channel, suggests volume volatility.`,
    });
  }

  // 3. Fastest grower (second half vs first half)
  let fastestGrower: { channel: string; growth: number; first: number; second: number } | null = null;
  for (const c of perChannel) {
    if (c.firstHalfRev < 500) continue; // ignore very small channels
    const growth = (c.secondHalfRev - c.firstHalfRev) / c.firstHalfRev;
    if (!fastestGrower || growth > fastestGrower.growth) {
      fastestGrower = { channel: c.channel, growth, first: c.firstHalfRev, second: c.secondHalfRev };
    }
  }
  if (fastestGrower && fastestGrower.growth > 0.10) {
    insights.push({
      tone: 'good',
      icon: '🚀',
      title: `${fastestGrower.channel} fastest growing`,
      body: `Revenue grew ${fmtPct(fastestGrower.growth)} from ${fmtCurrency(fastestGrower.first, market)} (first half) to ${fmtCurrency(fastestGrower.second, market)} (second half).`,
    });
  }

  // 4. Fastest decliner
  let fastestDecliner: { channel: string; decline: number; first: number; second: number } | null = null;
  for (const c of perChannel) {
    if (c.firstHalfRev < 500) continue;
    const growth = (c.secondHalfRev - c.firstHalfRev) / c.firstHalfRev;
    if (!fastestDecliner || growth < fastestDecliner.decline) {
      fastestDecliner = { channel: c.channel, decline: growth, first: c.firstHalfRev, second: c.secondHalfRev };
    }
  }
  if (fastestDecliner && fastestDecliner.decline < -0.10) {
    insights.push({
      tone: 'warn',
      icon: '📉',
      title: `${fastestDecliner.channel} declining`,
      body: `Revenue dropped ${fmtPct(Math.abs(fastestDecliner.decline))} from ${fmtCurrency(fastestDecliner.first, market)} to ${fmtCurrency(fastestDecliner.second, market)}. Investigate paid/organic mix.`,
    });
  }

  // 5. Concentration: top 3 channels = X% of total
  if (byRevenue.length >= 3 && grandTotal > 0) {
    const top3Rev = byRevenue.slice(0, 3).reduce((s, c) => s + c.revenue, 0);
    const concentration = top3Rev / grandTotal;
    if (concentration > 0.75) {
      insights.push({
        tone: 'warn',
        icon: '⚠️',
        title: 'High channel concentration',
        body: `Top 3 channels (${byRevenue.slice(0, 3).map((c) => c.channel).join(', ')}) account for ${fmtPct(concentration)} of revenue. Diversifying reduces single-channel risk.`,
      });
    } else {
      insights.push({
        tone: 'good',
        icon: '⚖️',
        title: 'Healthy channel diversity',
        body: `Top 3 channels are ${fmtPct(concentration)} of revenue. No over-reliance on a single source.`,
      });
    }
  }

  // 6. Direct / no-attribution alert
  const direct = perChannel.find((c) => slugFor(c.channel) === 'sem_utm_direto');
  if (direct && grandTotal > 0) {
    const directShare = direct.revenue / grandTotal;
    if (directShare > 0.40) {
      insights.push({
        tone: 'warn',
        icon: '🔍',
        title: 'High direct / no-UTM traffic',
        body: `${fmtPct(directShare)} of revenue has no attribution. Check UTM tagging on marketing links — much of this is likely organic search or brand traffic being missed.`,
      });
    }
  }

  // 7. Most stable channel
  const eligible = perChannel.filter((c) => c.revenue > grandTotal * 0.05); // only channels >5% of total
  if (eligible.length > 1) {
    const byStability = [...eligible].sort((a, b) => stdDev(a.dailyShares) - stdDev(b.dailyShares));
    const mostStable = byStability[0];
    insights.push({
      tone: 'info',
      icon: '📈',
      title: `${mostStable.channel} most predictable`,
      body: `Lowest daily share variance (${fmtPct(stdDev(mostStable.dailyShares), 2)}). Reliable baseline channel.`,
    });
  }

  return insights;
}

const TONE_STYLES: Record<InsightTone, { bg: string; border: string; iconBg: string }> = {
  good: { bg: 'rgba(16,185,129,0.06)', border: '#10b981', iconBg: 'rgba(16,185,129,0.15)' },
  info: { bg: 'rgba(59,130,246,0.06)', border: '#3b82f6', iconBg: 'rgba(59,130,246,0.15)' },
  warn: { bg: 'rgba(245,158,11,0.06)', border: '#f59e0b', iconBg: 'rgba(245,158,11,0.15)' },
};

export default function ChannelShareInsights({ data }: Props) {
  const insights = computeInsights(data);
  if (insights.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="text-xs font-bold uppercase tracking-[0.15em] text-ink mb-4 flex items-center gap-2.5">
        <span className="inline-block w-1 h-4 bg-accent rounded-full" />
        💡 INSIGHTS - {data.market}
      </div>
      <p className="text-sm text-steel mb-4">
        Auto-computed from the period&apos;s daily revenue data. Halves are split at the period midpoint.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {insights.map((i, idx) => {
          const s = TONE_STYLES[i.tone];
          return (
            <div
              key={idx}
              className="rounded-xl p-4 flex gap-3"
              style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeftWidth: 4 }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg"
                style={{ background: s.iconBg }}
              >
                {i.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-ink mb-1">{i.title}</div>
                <div className="text-[12px] text-steel leading-relaxed">{i.body}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

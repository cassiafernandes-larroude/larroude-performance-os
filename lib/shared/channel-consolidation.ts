/**
 * Consolidação de canais compartilhada — usado por TODOS os dashboards que
 * mostram receita por canal (Main Dashboard, Channel Share, Overview, etc.)
 *
 * REGRA (Cassia, REGRAS-LARROUDE-OS.md secao 4.1):
 *   "Orgânico Search" + "Orgânico Social" → consolidados em "Orgânico"
 *   Cor #22c55e (verde).
 */

import type { ChannelRevenue, DashboardPayload, DailyPoint } from '@/lib/main-dashboard/types';

const ORGANIC_LABELS = new Set([
  'Orgânico Search',
  'Orgânico Social',
  'Organico Search',
  'Organico Social',
  'Orgânico Social (IG)',
  'Organico Social (IG)',
]);

const ORGANIC_COLOR = '#22c55e';

/**
 * Consolida channels (totais agregados). Retorna nova array ordenada por receita desc.
 */
export function consolidateOrganicChannels(channels: ChannelRevenue[]): ChannelRevenue[] {
  let organicRev = 0;
  let organicPct = 0;
  const others: ChannelRevenue[] = [];
  for (const c of channels) {
    if (ORGANIC_LABELS.has(c.channel)) {
      organicRev += c.revenue;
      organicPct += c.pct ?? 0;
    } else {
      others.push(c);
    }
  }
  if (organicRev > 0) {
    others.push({
      channel: 'Orgânico',
      revenue: organicRev,
      pct: organicPct,
      color: ORGANIC_COLOR,
    });
  }
  return others.sort((a, b) => b.revenue - a.revenue);
}

/**
 * Consolida o payload completo: channels (totais) + daily.channel_organico_search/_social
 * → daily.channel_organico (soma dia-a-dia).
 *
 * Retorna novo DashboardPayload sem mutar o original.
 */
export function consolidateOrganicPayload(data: DashboardPayload): DashboardPayload {
  const newChannels = consolidateOrganicChannels(data.channels ?? []);

  // Daily: soma channel_organico_search + channel_organico_social → channel_organico
  const daily = { ...(data.daily ?? {}) } as any;
  const searchSeries: DailyPoint[] = daily.channel_organico_search ?? [];
  const socialSeries: DailyPoint[] = daily.channel_organico_social ?? [];
  const igSeries: DailyPoint[] = daily.channel_organico_social_ig ?? [];

  if (searchSeries.length > 0 || socialSeries.length > 0 || igSeries.length > 0) {
    const sumByDate = new Map<string, { value: number; inPeriod?: boolean }>();
    for (const series of [searchSeries, socialSeries, igSeries]) {
      for (const pt of series) {
        const existing = sumByDate.get(pt.date);
        if (existing) {
          existing.value += pt.value ?? 0;
          if (pt.inPeriod !== undefined) existing.inPeriod = pt.inPeriod;
        } else {
          sumByDate.set(pt.date, { value: pt.value ?? 0, inPeriod: pt.inPeriod });
        }
      }
    }
    const merged: DailyPoint[] = Array.from(sumByDate.entries())
      .map(([date, v]) => ({ date, value: v.value, inPeriod: v.inPeriod }))
      .sort((a, b) => a.date.localeCompare(b.date));
    daily.channel_organico = merged;
    // Remove os originais pra evitar duplicação em loops que iteram daily.channel_*
    delete daily.channel_organico_search;
    delete daily.channel_organico_social;
    delete daily.channel_organico_social_ig;
  }

  return { ...data, channels: newChannels, daily };
}

/**
 * Mapa canal → slug usado pra construir keys daily.channel_<slug>.
 * Mesma lógica usada em ChannelShareGrid + queries.ts.
 */
export function slugForChannel(channel: string): string {
  if (channel === 'Orgânico' || channel === 'Organico') return 'organico';
  if (channel === 'Orgânico Search' || channel === 'Organico Search') return 'organico_search';
  if (channel === 'Orgânico Social' || channel === 'Organico Social') return 'organico_social';
  if (channel === 'Orgânico Social (IG)' || channel === 'Organico Social (IG)') return 'organico_social_ig';
  if (channel === 'Sem UTM / Direto' || channel === 'Direto' || channel === 'Direct') return 'direto';
  if (channel === 'Meta Ads') return 'meta_ads';
  if (channel === 'Google Ads') return 'google_ads';
  if (channel === 'Klaviyo Email') return 'klaviyo_email';
  if (channel === 'SMS Attentive') return 'sms_attentive';
  if (channel === 'Awin Affiliate') return 'awin';
  if (channel === 'ShopMy') return 'shopmy';
  if (channel === 'Agent.shop') return 'agent_shop';
  if (channel === 'Criteo') return 'criteo';
  return 'outros';
}

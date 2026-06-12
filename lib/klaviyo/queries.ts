/**
 * Klaviyo API queries — listCampaigns, listFlows, listSegments, campaignReports, flowReports.
 * Replicado de larroude-crm-dashboard com gotchas embutidos.
 */

import { klaviyoFetch, klaviyoPaginate, endExclusive } from './client';
import type { Market, DateRange } from './types';
import { toKlaviyoDatetime } from './period';

// ============================================================================
// CAMPAIGNS — filter por scheduled_at (NÃO send_time)
// ============================================================================
export async function listCampaigns(market: Market, range: DateRange) {
  const startIso = toKlaviyoDatetime(range.start);
  const endIso = toKlaviyoDatetime(range.end, true);
  const filter = `and(greater-or-equal(scheduled_at,${startIso}),less-or-equal(scheduled_at,${endIso}),equals(messages.channel,'email'))`;
  const path = `/campaigns/?filter=${encodeURIComponent(filter)}&page[size]=100&fields[campaign]=name,scheduled_at,send_time,status`;
  return klaviyoPaginate<any>(market, path);
}

// ============================================================================
// FLOWS — page_size max = 50
// ============================================================================
export async function listFlows(market: Market) {
  const filter = `equals(status,'live')`;
  const path = `/flows/?filter=${encodeURIComponent(filter)}&page[size]=50&fields[flow]=name,status,trigger_type,created`;
  return klaviyoPaginate<any>(market, path);
}

// ============================================================================
// SEGMENTS — page_size max = 10
// ============================================================================
export async function listSegments(market: Market) {
  // page_size MAX = 10 (limite Klaviyo). additional-fields=profile_count para profile count.
  const path = `/segments/?page[size]=10&additional-fields[segment]=profile_count&fields[segment]=name,created`;
  return klaviyoPaginate<any>(market, path);
}

// ============================================================================
// CAMPAIGN VALUES REPORT
// Rate limit MUITO agressivo. NÃO paralelizar com flowReports.
// ============================================================================
export async function campaignReports(market: Market, range: DateRange, campaignIds: string[]) {
  if (campaignIds.length === 0) return [];
  const body = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        statistics: [
          'recipients', 'delivered', 'opens_unique', 'clicks_unique',
          'unsubscribes', 'bounced', 'spam_complaints', 'revenue', 'orders',
        ],
        timeframe: {
          start: toKlaviyoDatetime(range.start),
          end: toKlaviyoDatetime(range.end, true),
        },
        filter: `any(campaign_id,[${campaignIds.map((id) => `"${id}"`).join(',')}])`,
        conversion_metric_id: await getPlacedOrderMetricId(market),
      },
    },
  };
  const json = await klaviyoFetch<any>(market, '/campaign-values-reports/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return json?.data?.attributes?.results ?? [];
}

// ============================================================================
// FLOW VALUES REPORT — group_by REQUER 'flow_id'
// ============================================================================
export async function flowReports(market: Market, range: DateRange, flowIds: string[]) {
  if (flowIds.length === 0) return [];
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        statistics: [
          'recipients', 'delivered', 'opens_unique', 'clicks_unique',
          'unsubscribes', 'bounced', 'revenue', 'orders',
        ],
        timeframe: {
          start: toKlaviyoDatetime(range.start),
          end: toKlaviyoDatetime(range.end, true),
        },
        filter: `any(flow_id,[${flowIds.map((id) => `"${id}"`).join(',')}])`,
        group_by: ['flow_id'],
        conversion_metric_id: await getPlacedOrderMetricId(market),
      },
    },
  };
  const json = await klaviyoFetch<any>(market, '/flow-values-reports/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return json?.data?.attributes?.results ?? [];
}

// ============================================================================
// FLOW SERIES REPORT — group_by REQUER ['flow_id','flow_message_id'] juntos.
// Para time-series por step.
// ============================================================================
export async function flowSeriesByStep(market: Market, range: DateRange, flowIds: string[]) {
  if (flowIds.length === 0) return [];
  const body = {
    data: {
      type: 'flow-series-report',
      attributes: {
        statistics: ['recipients', 'opens_unique', 'clicks_unique', 'unsubscribes', 'revenue'],
        timeframe: {
          start: toKlaviyoDatetime(range.start),
          end: toKlaviyoDatetime(range.end, true),
        },
        interval: 'daily',
        filter: `any(flow_id,[${flowIds.map((id) => `"${id}"`).join(',')}])`,
        group_by: ['flow_id', 'flow_message_id'], // ← CRITICAL: ambos juntos
        conversion_metric_id: await getPlacedOrderMetricId(market),
      },
    },
  };
  const json = await klaviyoFetch<any>(market, '/flow-series-reports/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return json?.data?.attributes?.results ?? [];
}

// ============================================================================
// METRIC AGGREGATES — só aceita less-than. measurements depende da metric.
// ============================================================================
let cachedMetricIds: Map<string, string> = new Map();
async function getPlacedOrderMetricId(market: Market): Promise<string> {
  const key = `placed_order:${market}`;
  if (cachedMetricIds.has(key)) return cachedMetricIds.get(key)!;
  const json: any = await klaviyoFetch(market, '/metrics/?fields[metric]=name,integration');
  const list = json?.data ?? [];
  const m = list.find((x: any) => /placed\s*order/i.test(x?.attributes?.name || ''));
  if (!m) throw new Error(`Placed Order metric not found in Klaviyo ${market}`);
  cachedMetricIds.set(key, m.id);
  return m.id;
}

/**
 * List Health: subscriptions, unsubscribes, bounces, spam.
 */
export async function listHealthAggregate(market: Market, range: DateRange) {
  const endExc = endExclusive(toKlaviyoDatetime(range.end, true));

  async function aggregate(metricName: string, measurement: 'count' | 'sum_value') {
    const metricsJson: any = await klaviyoFetch(market, '/metrics/?fields[metric]=name');
    const metric = (metricsJson?.data ?? []).find((x: any) => new RegExp(metricName, 'i').test(x?.attributes?.name || ''));
    if (!metric) return 0;
    const body = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metric.id,
          measurements: [measurement],
          interval: 'day',
          filter: [
            `greater-or-equal(datetime,${toKlaviyoDatetime(range.start)})`,
            `less-than(datetime,${endExc})`,
          ],
        },
      },
    };
    const json: any = await klaviyoFetch(market, '/metric-aggregates/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const stats = json?.data?.attributes?.data?.[0]?.measurements?.[measurement] ?? [];
    return Array.isArray(stats) ? stats.reduce((a: number, b: number) => a + (b || 0), 0) : 0;
  }

  const [subs, unsubs, bounces, spam] = await Promise.all([
    aggregate('subscribed to list', 'count').catch(() => 0),
    aggregate('unsubscribed', 'count').catch(() => 0),
    aggregate('bounced email', 'count').catch(() => 0),
    aggregate('marked email as spam', 'count').catch(() => 0),
  ]);
  return { subs, unsubs, bounces, spam };
}

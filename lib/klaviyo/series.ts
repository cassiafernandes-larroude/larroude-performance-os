/**
 * Klaviyo series-reports (daily breakdown) + utilities.
 *
 * /flow-series-reports usa group_by ['flow_id','flow_message_id'] juntos.
 * /campaign-series-reports não precisa de group_by (já é por campaign).
 *
 * Parser: results[].statistics[name][idx] alinhado com results[].date_times[idx].
 */

import { klaviyoFetch, endExclusive } from './client';
import type { Market, DateRange, DailyPoint } from './types';
import { toKlaviyoDatetime } from './period';

let cachedMetricIds: Map<string, string> = new Map();

async function getPlacedOrderMetricId(market: Market): Promise<string> {
  const key = `placed_order:${market}`;
  if (cachedMetricIds.has(key)) return cachedMetricIds.get(key)!;
  const json: any = await klaviyoFetch(market, '/metrics/?fields[metric]=name');
  const list = json?.data ?? [];
  const m = list.find((x: any) => /placed\s*order/i.test(x?.attributes?.name || ''));
  if (!m) throw new Error(`Placed Order metric not found in Klaviyo ${market}`);
  cachedMetricIds.set(key, m.id);
  return m.id;
}

/**
 * Campaign series daily — bucketize por dia agregando todas campanhas.
 */
export async function campaignSeriesDaily(
  market: Market,
  range: DateRange,
  campaignIds: string[]
): Promise<Record<string, DailyPoint[]>> {
  if (campaignIds.length === 0) return emptyDaily();
  const body = {
    data: {
      type: 'campaign-series-report',
      attributes: {
        statistics: ['recipients', 'opens_unique', 'clicks_unique', 'unsubscribes', 'revenue', 'bounced'],
        timeframe: {
          start: toKlaviyoDatetime(range.start),
          end: toKlaviyoDatetime(range.end, true),
        },
        interval: 'daily',
        filter: `any(campaign_id,[${campaignIds.map((id) => `"${id}"`).join(',')}])`,
        conversion_metric_id: await getPlacedOrderMetricId(market),
      },
    },
  };
  const json: any = await klaviyoFetch(market, '/campaign-series-reports/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return parseSeriesResults(json?.data?.attributes?.results ?? [], json?.data?.attributes?.date_times ?? []);
}

/**
 * Flow series daily — agrega todos flows (sem por-step).
 */
export async function flowSeriesDaily(
  market: Market,
  range: DateRange,
  flowIds: string[]
): Promise<Record<string, DailyPoint[]>> {
  if (flowIds.length === 0) return emptyDaily();
  const body = {
    data: {
      type: 'flow-series-report',
      attributes: {
        statistics: ['recipients', 'opens_unique', 'clicks_unique', 'unsubscribes', 'revenue', 'bounced'],
        timeframe: {
          start: toKlaviyoDatetime(range.start),
          end: toKlaviyoDatetime(range.end, true),
        },
        interval: 'daily',
        filter: `any(flow_id,[${flowIds.map((id) => `"${id}"`).join(',')}])`,
        group_by: ['flow_id', 'flow_message_id'], // gotcha: SEMPRE os dois juntos
        conversion_metric_id: await getPlacedOrderMetricId(market),
      },
    },
  };
  const json: any = await klaviyoFetch(market, '/flow-series-reports/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return parseSeriesResults(json?.data?.attributes?.results ?? [], json?.data?.attributes?.date_times ?? []);
}

/**
 * Flow series por step de UM flow específico — multi-line view.
 * Retorna por (flow_id, flow_message_id).
 */
export async function flowSeriesByStep(
  market: Market,
  range: DateRange,
  flowId: string
): Promise<{ stepId: string; stepName?: string; daily: Record<string, DailyPoint[]> }[]> {
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
        filter: `equals(flow_id,"${flowId}")`,
        group_by: ['flow_id', 'flow_message_id'],
        conversion_metric_id: await getPlacedOrderMetricId(market),
      },
    },
  };
  const json: any = await klaviyoFetch(market, '/flow-series-reports/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const dates = json?.data?.attributes?.date_times ?? [];
  const results = json?.data?.attributes?.results ?? [];
  return results.map((r: any) => ({
    stepId: r?.groupings?.flow_message_id || 'unknown',
    stepName: r?.groupings?.flow_message_name,
    daily: parseSingleResult(r, dates),
  }));
}

// ============================================================================
// PARSERS
// ============================================================================

function emptyDaily(): Record<string, DailyPoint[]> {
  return {
    revenue: [], recipients: [], opens: [], clicks: [], unsubscribes: [], bounced: [],
  };
}

/**
 * Parser que AGREGA múltiplos results em um único Record<statistic, DailyPoint[]>.
 * Para series com group_by, soma valores por (date_time, statistic).
 */
function parseSeriesResults(results: any[], dateTimes: string[]): Record<string, DailyPoint[]> {
  const out: Record<string, DailyPoint[]> = emptyDaily();
  const dates = dateTimes.map((d) => String(d).slice(0, 10));
  const sumByDateBy = new Map<string, Map<string, number>>();

  for (const r of results) {
    const stats = r?.statistics ?? {};
    for (const [statKey, arr] of Object.entries(stats)) {
      if (!Array.isArray(arr)) continue;
      const mappedKey = mapStatKey(statKey);
      if (!mappedKey) continue;
      let byStat = sumByDateBy.get(mappedKey);
      if (!byStat) { byStat = new Map(); sumByDateBy.set(mappedKey, byStat); }
      for (let i = 0; i < arr.length && i < dates.length; i++) {
        const d = dates[i];
        byStat.set(d, (byStat.get(d) ?? 0) + Number((arr as any[])[i] || 0));
      }
    }
  }

  for (const [k, byDate] of sumByDateBy.entries()) {
    out[k] = dates.map((d) => ({ date: d, value: byDate.get(d) ?? 0 }));
  }
  // Fill empty keys
  for (const k of Object.keys(out)) {
    if (out[k].length === 0) out[k] = dates.map((d) => ({ date: d, value: 0 }));
  }
  return out;
}

function parseSingleResult(r: any, dateTimes: string[]): Record<string, DailyPoint[]> {
  const out: Record<string, DailyPoint[]> = emptyDaily();
  const dates = dateTimes.map((d) => String(d).slice(0, 10));
  const stats = r?.statistics ?? {};
  for (const [statKey, arr] of Object.entries(stats)) {
    const mappedKey = mapStatKey(statKey);
    if (!mappedKey || !Array.isArray(arr)) continue;
    out[mappedKey] = dates.map((d, i) => ({ date: d, value: Number((arr as any[])[i] || 0) }));
  }
  return out;
}

function mapStatKey(klaviyoKey: string): string | null {
  switch (klaviyoKey) {
    case 'recipients': return 'recipients';
    case 'opens_unique': return 'opens';
    case 'clicks_unique': return 'clicks';
    case 'unsubscribes': return 'unsubscribes';
    case 'revenue': return 'revenue';
    case 'bounced': return 'bounced';
    default: return null;
  }
}

/**
 * Merge 2 dailies somando os valores por data e key (campaigns + flows).
 */
export function mergeDailies(
  a: Record<string, DailyPoint[]>,
  b: Record<string, DailyPoint[]>
): Record<string, DailyPoint[]> {
  const out: Record<string, DailyPoint[]> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const byDate = new Map<string, number>();
    (a[k] ?? []).forEach((p) => byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value));
    (b[k] ?? []).forEach((p) => byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value));
    out[k] = Array.from(byDate.entries())
      .sort(([d1], [d2]) => d1.localeCompare(d2))
      .map(([date, value]) => ({ date, value }));
  }
  return out;
}

/**
 * Day-of-Week aggregation a partir de daily series (campaign + flow).
 * Retorna [{ dow: 0..6, label: 'Sun', revenue, opens, clicks, sends }]
 */
export function dayOfWeekAggregate(daily: Record<string, DailyPoint[]>) {
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets = Array.from({ length: 7 }, () => ({ revenue: 0, opens: 0, clicks: 0, sends: 0 }));
  const merge = (key: string, target: keyof typeof buckets[0]) => {
    (daily[key] ?? []).forEach((p) => {
      const d = new Date(p.date + 'T12:00:00Z');
      const dow = d.getUTCDay();
      (buckets[dow] as any)[target] += p.value;
    });
  };
  merge('revenue', 'revenue');
  merge('opens', 'opens');
  merge('clicks', 'clicks');
  merge('recipients', 'sends');
  return buckets.map((b, i) => ({ dow: i, label: dows[i], ...b }));
}

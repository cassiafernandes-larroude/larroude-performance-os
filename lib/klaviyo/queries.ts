import { klaviyoFetch, klaviyoPaginate } from './klaviyo';
export { klaviyoPaginate };
import { classifyCampaign, classifyFlow, isCsFlow } from './classify';
import type { Market, CampaignRow, FlowRow, DateRange } from '@/types/klaviyo/models';

// Lista campanhas Sent no período. Klaviyo só permite filtrar por scheduled_at (não send_time).
export async function listCampaigns(market: Market, range: DateRange) {
  const filter = `and(equals(messages.channel,"email"),equals(status,"Sent"),greater-or-equal(scheduled_at,${range.start}),less-or-equal(scheduled_at,${range.end}))`;
  const data = await klaviyoPaginate(market, '/campaigns', {
    'filter': filter,
    'fields[campaign]': 'name,status,send_time,scheduled_at,audiences',
    'sort': '-scheduled_at'
  });
  return data;
}

// Relatório de campanhas — agregado por campanha.
export async function campaignReports(market: Market, range: DateRange) {
  const body = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        timeframe: { start: range.start, end: range.end },
        statistics: ['opens_unique','clicks_unique','conversions','conversion_value','recipients','delivered','bounced','unsubscribes','spam_complaints','open_rate','click_rate','conversion_rate','revenue_per_recipient','bounce_rate','unsubscribe_rate'],
        conversion_metric_id: await placedOrderMetricId(market)
      }
    }
  };
  return klaviyoFetch({ market, path: '/campaign-values-reports/', method: 'POST', body });
}

export async function flowReports(market: Market, range: DateRange) {
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        timeframe: { start: range.start, end: range.end },
        statistics: ['opens_unique','clicks_unique','conversions','conversion_value','recipients','delivered','bounced','unsubscribes','spam_complaints','open_rate','click_rate','conversion_rate','revenue_per_recipient','bounce_rate','unsubscribe_rate'],
        conversion_metric_id: await placedOrderMetricId(market)
      }
    }
  };
  return klaviyoFetch({ market, path: '/flow-values-reports/', method: 'POST', body });
}

// Daily/weekly/monthly time-series para flows. Klaviyo aceita interval=daily|weekly|monthly.
export async function flowSeriesReport(market: Market, range: DateRange, interval: 'daily'|'weekly'|'monthly' = 'daily') {
  const body = {
    data: {
      type: 'flow-series-report',
      attributes: {
        timeframe: { start: range.start, end: range.end },
        interval,
        statistics: ['opens_unique','clicks_unique','conversions','conversion_value','recipients','delivered','open_rate','click_rate','revenue_per_recipient'],
        conversion_metric_id: await placedOrderMetricId(market)
      }
    }
  };
  return klaviyoFetch({ market, path: '/flow-series-reports/', method: 'POST', body });
}

// Resolve o Placed Order metric id (Shopify ou Klaviyo) — cacheado por mercado.
const metricCache: Record<string, string> = {};
export async function placedOrderMetricId(market: Market): Promise<string> {
  if (metricCache[market]) return metricCache[market];
  // /metrics não suporta filtro por integration.category; pega tudo e filtra em memória
  const all = await klaviyoPaginate<any>(market, '/metrics', {
    'fields[metric]': 'name,integration'
  });
  const placed = all.find((m: any) => /placed\s*order/i.test(m?.attributes?.name || ''));
  metricCache[market] = placed?.id || '';
  return metricCache[market];
}

// Lista flows live. Klaviyo limita page[size] a 50 em /flows.
export async function listLiveFlows(market: Market) {
  return klaviyoPaginate(market, '/flows', {
    'filter': 'equals(status,"live")',
    'fields[flow]': 'name,status,trigger_type,created',
    'page[size]': 50
  });
}

// Segments — ativos. Klaviyo limita /segments page_size a 10.
export async function listSegments(market: Market) {
  return klaviyoPaginate(market, '/segments', {
    'fields[segment]': 'name,definition,created,updated',
    'page[size]': 10
  });
}

// Lists (subscription growth). Klaviyo limita /lists a page_size máx. 10 (Cassia 2026-06-21: era 50 → 400).
export async function listLists(market: Market) {
  return klaviyoPaginate(market, '/lists', {
    'fields[list]': 'name,created,updated',
    'page[size]': 10
  });
}

// Métrica agregada. Klaviyo /metric-aggregates só aceita 'greater-or-equal' e 'less-than' em datetime.
export async function queryMetricAggregate(market: Market, metricId: string, range: DateRange, interval: 'day'|'week'|'month' = 'week', measurements: string[] = ['count']) {
  // Cassia 2026-06-29: o /metric-aggregates aceita no MÁXIMO 1 ano de range. Como o end é tratado
  // de forma inclusiva (less-than em end+1s), o período 12M (365d) virava "1 ano e 1 segundo" e o
  // Klaviyo devolvia 400. Clampa a janela [start, end+1s) para no máx. 1 ano (− 1s de margem).
  const endExclusiveMs = new Date(range.end).getTime() + 1000;
  const ONE_YEAR_MS = 365 * 86400000;
  const startMs = Math.max(new Date(range.start).getTime(), endExclusiveMs - (ONE_YEAR_MS - 1000));
  const startClamped = new Date(startMs).toISOString();
  const endExclusive = new Date(endExclusiveMs).toISOString();
  const body = {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: metricId,
        measurements,
        interval,
        timezone: 'UTC',
        filter: [`greater-or-equal(datetime,${startClamped})`, `less-than(datetime,${endExclusive})`],
        page_size: 500
      }
    }
  };
  return klaviyoFetch({ market, path: '/metric-aggregates/', method: 'POST', body });
}

// Helpers para extrair estatística pelo nome
export function getStat(row: any, stat: string): number {
  const stats: string[] = row?.attributes?.statistics || row?.statistics || [];
  const vals: number[] = row?.attributes?.results?.[0]?.values || row?.values || [];
  const idx = stats.indexOf(stat);
  if (idx < 0) return 0;
  const v = vals[idx];
  return typeof v === 'number' ? v : 0;
}

export { classifyCampaign, classifyFlow, isCsFlow };

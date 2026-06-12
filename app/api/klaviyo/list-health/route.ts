import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readParams, tag } from '@/lib/klaviyo/cache-key';
import { periodToRange, rangeDays } from '@/lib/klaviyo/period';
import { klaviyoPaginate } from '@/lib/klaviyo/klaviyo';
import { queryMetricAggregate } from '@/lib/klaviyo/queries';
import type { Market, Period } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function resolveMetricIds(market: Market): Promise<{ ids: Record<string, string>; totalFound: number }> {
  const all = await klaviyoPaginate<any>(market, '/metrics', {
    'fields[metric]': 'name,integration'
  });
  const ids: Record<string, string> = {};
  for (const m of all) {
    const name = m?.attributes?.name || '';
    ids[name] = m.id;
  }
  return { ids, totalFound: all.length };
}

async function load(market: Market, period: Period, custom?: { start: string; end: string }) {
  const range = periodToRange(period, custom);
  const days = rangeDays(range);
  const interval: 'day'|'week'|'month' = days <= 40 ? 'day' : days <= 90 ? 'week' : 'month';

  const { ids: idsByName, totalFound: metricCount } = await resolveMetricIds(market);

  const subscribedId = idsByName['Subscribed to Email Marketing'] || idsByName['Subscribed to List'] || '';
  const unsubscribedId = idsByName['Unsubscribed from Email Marketing'] || idsByName['Unsubscribed from List'] || '';
  const spamId = idsByName['Marked Email as Spam'] || '';
  const bounceId = idsByName['Bounced Email'] || '';

  function parseAggregate(resp: any): { date: string; value: number }[] {
    const attrs = resp?.data?.attributes;
    if (!attrs) return [];
    const dates: string[] = attrs.dates || [];
    const data: any[] = attrs.data || [];
    let vals: number[] = [];
    if (data[0]?.measurements?.count) vals = data[0].measurements.count;
    else if (data[0]?.values) vals = data[0].values;
    return dates.map((d, i) => ({ date: d.slice(0, 10), value: vals[i] || 0 }));
  }

  // Inicializa pontos a partir do primeiro fetch (subscribedId)
  let points: { date: string; subscriptions: number; unsubscribes: number; spam: number; bounces: number; net: number }[] = [];

  async function fetchAndMerge(id: string, key: 'subscriptions' | 'unsubscribes' | 'spam' | 'bounces') {
    if (!id) return;
    try {
      const agg = await queryMetricAggregate(market, id, range, interval as 'day'|'week');
      const series = parseAggregate(agg);
      // Se ainda não inicializamos, usar essa série como base de datas
      if (points.length === 0 && series.length > 0) {
        points = series.map(s => ({ date: s.date, subscriptions: 0, unsubscribes: 0, spam: 0, bounces: 0, net: 0 }));
      }
      for (const s of series) {
        let p = points.find(pp => pp.date === s.date);
        if (!p) {
          p = { date: s.date, subscriptions: 0, unsubscribes: 0, spam: 0, bounces: 0, net: 0 };
          points.push(p);
        }
        p[key] = s.value;
      }
    } catch (e) {/* não bloqueia */}
  }

  await fetchAndMerge(subscribedId, 'subscriptions');
  await fetchAndMerge(unsubscribedId, 'unsubscribes');
  await fetchAndMerge(spamId, 'spam');
  await fetchAndMerge(bounceId, 'bounces');

  points.sort((a, b) => a.date.localeCompare(b.date));
  points.forEach(p => { p.net = p.subscriptions - p.unsubscribes; });

  const total = {
    subscriptions: points.reduce((s,p) => s + p.subscriptions, 0),
    unsubscribes: points.reduce((s,p) => s + p.unsubscribes, 0),
    spam: points.reduce((s,p) => s + p.spam, 0),
    bounces: points.reduce((s,p) => s + p.bounces, 0)
  };

  return {
    generatedAt: new Date().toISOString(), market, period, range, interval, points, total,
    net: total.subscriptions - total.unsubscribes,
    metricsUsed: {
      subscribed: subscribedId ? Object.keys(idsByName).find(k => idsByName[k] === subscribedId) : null,
      unsubscribed: unsubscribedId ? Object.keys(idsByName).find(k => idsByName[k] === unsubscribedId) : null,
      totalMetricsFound: metricCount
    }
  };
}

export async function GET(req: NextRequest) {
  try {
    const { market, period, custom } = readParams(req.nextUrl.searchParams);
    const fetcher = unstable_cache(() => load(market, period, custom), ['list-health-v3', market, period, custom?.start || '', custom?.end || ''], { tags: [tag(market, 'list-health')], revalidate: 43200 });
    return NextResponse.json(await fetcher(), { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

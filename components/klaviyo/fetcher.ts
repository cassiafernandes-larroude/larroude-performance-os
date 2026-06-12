import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

export async function api<T = any>(path: string, market: Market, period: Period, custom?: CustomRange): Promise<T> {
  const qs = new URLSearchParams({ market, period });
  if (period === 'CUSTOM' && custom?.start && custom?.end) {
    qs.set('start', custom.start);
    qs.set('end', custom.end);
  }
  const res = await fetch(`/api/klaviyo/${path}?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

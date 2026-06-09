/**
 * In-memory LRU cache para LTV queries.
 *
 * Por que: BigQuery queries do LTV demoram 5-30s. O `s-maxage` do header só
 * funciona se Vercel CDN tiver o resultado. Para warm starts da mesma lambda,
 * um cache em processo evita refazer a query de novo.
 *
 * TTL: 6h. Cron diário reabastece todo dia às 08:00 BRT, então 6h cobre
 * com folga as flutuacoes intra-dia.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 64;
const cache = new Map<string, Entry<unknown>>();

export async function memo<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlMs });
  // LRU evict (simples FIFO)
  if (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return value;
}

export const TTL_6H = 6 * 60 * 60 * 1000;
export const TTL_24H = 24 * 60 * 60 * 1000;

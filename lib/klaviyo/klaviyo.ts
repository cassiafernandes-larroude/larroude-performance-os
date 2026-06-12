// Cliente Klaviyo isolado por mercado (US/BR).
// Suporta 2 contas separadas OU 1 conta com filtros de lista BR.
import type { Market } from '@/types/klaviyo/models';

// Aceita tanto KLAVIYO_API_KEY_* (novo) quanto KLAVIYO_PRIVATE_API_KEY_* (legado .env existente).
const REVISION = process.env.KLAVIYO_REVISION || process.env.KLAVIYO_API_VERSION || '2024-10-15';
const BASE = 'https://a.klaviyo.com/api';

export function getApiKey(market: Market): string {
  if (market === 'BR') {
    const br = process.env.KLAVIYO_API_KEY_BR || process.env.KLAVIYO_PRIVATE_API_KEY_BR;
    if (br && br.startsWith('pk_')) return br;
    // fallback: mesma conta US com filtro por lista
    return process.env.KLAVIYO_API_KEY_US || process.env.KLAVIYO_PRIVATE_API_KEY_US || '';
  }
  return process.env.KLAVIYO_API_KEY_US || process.env.KLAVIYO_PRIVATE_API_KEY_US || '';
}

export function getBrListIds(): string[] {
  const ids = (process.env.KLAVIYO_BR_LIST_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids;
}

export interface KlaviyoFetchOptions {
  market: Market;
  path: string;
  query?: Record<string, string | number | undefined>;
  method?: 'GET' | 'POST';
  body?: unknown;
}

export async function klaviyoFetch<T = any>(opts: KlaviyoFetchOptions): Promise<T> {
  const { market, path, query, method = 'GET', body } = opts;
  const key = getApiKey(market);
  if (!key) throw new Error(`Klaviyo API key missing for market=${market}`);

  const url = new URL(BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  // Retry com backoff exponencial para 429 e 5xx (Klaviyo rate limit)
  const maxAttempts = 7;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        revision: REVISION
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });

    if (res.ok) return (await res.json()) as T;

    const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < maxAttempts;
    if (shouldRetry) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      // Klaviyo report endpoints podem demorar até ~60s para liberar. Backoff agressivo.
      const isReport = /values-reports|series-reports/.test(path);
      const baseMs = isReport ? 4000 : 600;
      const maxMs = isReport ? 30000 : 10000;
      const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    const text = await res.text();
    throw new Error(`Klaviyo ${res.status} ${method} ${path} :: ${text.slice(0, 300)}`);
  }
  throw new Error(`Klaviyo ${method} ${path} :: exceeded ${maxAttempts} retries`);
}

export async function klaviyoPaginate<T = any>(market: Market, path: string, baseQuery: Record<string, any> = {}): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  let safety = 0;
  do {
    const q = { ...baseQuery } as Record<string, any>;
    if (cursor) q['page[cursor]'] = cursor;
    const resp: any = await klaviyoFetch({ market, path, query: q });
    if (Array.isArray(resp?.data)) out.push(...resp.data);
    cursor = undefined;
    const next = resp?.links?.next as string | undefined;
    if (next) {
      try { cursor = new URL(next).searchParams.get('page[cursor]') || undefined; } catch {}
    }
    safety++;
  } while (cursor && safety < 50);
  return out;
}

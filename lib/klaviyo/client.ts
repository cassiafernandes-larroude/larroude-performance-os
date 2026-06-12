/**
 * Cliente Klaviyo REST API (revision 2024-10-15).
 *
 * GOTCHAS aprendidos doendo (Cassia 2026-06-11):
 * - Rate limit é AGRESSIVO em /flow-values-reports/ e /campaign-values-reports/
 *   (burst ~3-5 req/min). Retry-After pode pedir 50-60s.
 * - SERIALIZAR prior/yoy fetches (não paralelizar) — paralelizar = 429
 * - /flow-series-reports group_by REQUER ['flow_id','flow_message_id'] juntos
 * - /metric-aggregates só aceita less-than (não less-or-equal) — usar endExclusive
 * - /metric-aggregates measurements=['sum_value'] pra revenue, 'count' pra subs
 * - /campaigns filter usa scheduled_at (não send_time)
 * - /flows page_size max = 50
 * - /segments page_size max = 10
 * - Parser response: results[].statistics[name] (objeto), NÃO results[].data[idx]
 *
 * Source: REPLICATION-GUIDE Section 5.
 */

import type { Market } from './types';

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const REVISION = process.env.KLAVIYO_REVISION || process.env.KLAVIYO_API_VERSION || '2024-10-15';

function getApiKey(market: Market): string {
  const key = market === 'US'
    ? (process.env.KLAVIYO_PRIVATE_API_KEY_US || process.env.KLAVIYO_API_KEY_US)
    : (process.env.KLAVIYO_PRIVATE_API_KEY_BR || process.env.KLAVIYO_API_KEY_BR);
  if (!key) throw new Error(`Missing Klaviyo API key for ${market}`);
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Fetch com retry exponencial. Cassia 2026-06-11:
 * - 7 attempts max
 * - reports endpoints (values/series): backoff até 30s
 * - outros: até 10s
 */
export async function klaviyoFetch<T = any>(
  market: Market,
  path: string,
  init?: RequestInit
): Promise<T> {
  const key = getApiKey(market);
  const url = path.startsWith('http') ? path : `${KLAVIYO_BASE}${path}`;
  const isReport = /values-reports|series-reports/.test(path);
  const baseMs = isReport ? 4000 : 600;
  const maxMs = isReport ? 30000 : 10000;
  const maxAttempts = 7;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        revision: REVISION,
        accept: 'application/vnd.api+json',
        'content-type': init?.method === 'POST' ? 'application/vnd.api+json' : 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 0;
      const backoff = retryAfter > 0
        ? Math.min(30000, retryAfter * 1000)
        : Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
      if (attempt === maxAttempts) {
        throw new Error(`Klaviyo 429 after ${maxAttempts} retries: ${path}`);
      }
      await sleep(backoff);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Klaviyo ${res.status} ${path}: ${body.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }
  throw new Error(`Klaviyo unreachable: ${path}`);
}

/**
 * Paginar GET endpoints com `links.next`.
 */
export async function klaviyoPaginate<T = any>(
  market: Market,
  initialPath: string
): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = initialPath;
  let safety = 0;
  while (next && safety++ < 100) {
    const json: any = await klaviyoFetch(market, next);
    if (Array.isArray(json?.data)) out.push(...json.data);
    next = json?.links?.next || null;
    if (next && !next.startsWith('http')) next = next; // já é path
  }
  return out;
}

/**
 * Helper: converte ISO datetime para o formato menor que aceito pelo metric-aggregates.
 * Klaviyo só aceita less-than (não less-or-equal). Use end+1s e less-than.
 */
export function endExclusive(end: string): string {
  return new Date(new Date(end).getTime() + 1000).toISOString();
}

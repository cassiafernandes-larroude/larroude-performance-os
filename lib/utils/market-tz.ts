/**
 * Resolução de datas por fuso horário do mercado.
 *
 * Cassia 2026-06-12: "os painéis de US devem estar dentro do fuso horário de
 *                     Nova York e os painéis de BR devem estar dentro do fuso
 *                     horário de Brasília."
 *
 * Antes usávamos `new Date().toISOString().slice(0, 10)` que retorna data em UTC.
 * Isso era inconsistente: 22h em NY já é dia seguinte em UTC, então o
 * "endDate=hoje" pulava 1 dia. Agora resolvemos a data calendário no fuso do
 * mercado correto.
 */

export type Market = 'US' | 'BR';

export const MARKET_TZ: Record<Market, string> = {
  US: 'America/New_York',
  BR: 'America/Sao_Paulo',
};

/**
 * Retorna a data calendário (YYYY-MM-DD) "hoje" no fuso do market.
 */
export function todayInMarket(market: Market): string {
  return ymdInTz(new Date(), MARKET_TZ[market]);
}

/**
 * Retorna a data calendário (YYYY-MM-DD) "D-N" (N dias atrás) no fuso do market.
 */
export function daysAgoInMarket(market: Market, n: number): string {
  return daysAgoInTz(new Date(), MARKET_TZ[market], n);
}

/**
 * Retorna a data D-1 ("ontem") no fuso do market — uso comum p/ "endDate".
 */
export function yesterdayInMarket(market: Market): string {
  return daysAgoInMarket(market, 1);
}

/**
 * Helper interno: formata uma Date como YYYY-MM-DD usando o fuso especificado.
 */
function ymdInTz(d: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA retorna no formato YYYY-MM-DD por padrão.
  return fmt.format(d);
}

/**
 * Helper interno: subtrai N dias da data atual e devolve YYYY-MM-DD no fuso.
 */
function daysAgoInTz(d: Date, tz: string, n: number): string {
  // 1) Resolve "hoje" no fuso, monta um Date em UTC com esse calendário
  //    e subtrai N dias usando UTC (24h fixo, sem DST quirks).
  const ymd = ymdInTz(d, tz);
  const [y, m, day] = ymd.split('-').map(Number);
  const base = Date.UTC(y, m - 1, day);
  const target = new Date(base - n * 86_400_000);
  return target.toISOString().slice(0, 10);
}

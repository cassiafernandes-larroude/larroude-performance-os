/**
 * Ajustes manuais de Meta Ads spend — regras de exceção por mercado/mês.
 *
 * Regra 1 (Cassia, registrada em 2026-04):
 *   - Meta US Setembro/2025 teve um spend não capturado pelas APIs/BQ
 *     no valor de +$400.000 USD. Adicionar manualmente.
 *
 * Aplicar em TODOS os dashboards que consomem spend de marketing.
 */

export type Market = 'US' | 'BR';

interface ManualAdjustment {
  market: Market;
  /** YYYY-MM-DD do primeiro dia do periodo de ajuste */
  startDate: string;
  /** YYYY-MM-DD do ultimo dia do periodo de ajuste (incluso) */
  endDate: string;
  /** Valor total adicional em USD (sera distribuido pro-rata pelos dias) */
  amountUsd: number;
  reason: string;
}

const MANUAL_ADJUSTMENTS: ManualAdjustment[] = [
  {
    market: 'US',
    startDate: '2025-09-01',
    endDate: '2025-09-30',
    amountUsd: 400_000,
    reason: 'Meta US Setembro/2025 — spend não capturado pelas APIs/BQ (regra Cassia 2026-04)',
  },
];

/**
 * Retorna spend adicional Meta para o período [start, end] do mercado.
 * Soma todos ajustes manuais aplicáveis, pro-rata pelos dias que overlap com o periodo.
 *
 * Exemplo: se periodo é 2025-09-15..2025-09-30 e o ajuste é set/25 inteiro ($400k),
 * retorna 400000 * (16 / 30) = ~$213k.
 */
export function getMetaSpendAdjustment(
  market: Market,
  startDate: string,
  endDate: string
): number {
  let total = 0;

  for (const adj of MANUAL_ADJUSTMENTS) {
    if (adj.market !== market) continue;

    // Calcula overlap entre [startDate, endDate] e [adj.startDate, adj.endDate]
    const periodStart = new Date(startDate + 'T00:00:00Z').getTime();
    const periodEnd = new Date(endDate + 'T00:00:00Z').getTime();
    const adjStart = new Date(adj.startDate + 'T00:00:00Z').getTime();
    const adjEnd = new Date(adj.endDate + 'T00:00:00Z').getTime();

    const overlapStart = Math.max(periodStart, adjStart);
    const overlapEnd = Math.min(periodEnd, adjEnd);
    if (overlapStart > overlapEnd) continue; // sem overlap

    const adjDays = Math.round((adjEnd - adjStart) / 86400000) + 1;
    const overlapDays = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
    const proRata = adj.amountUsd * (overlapDays / adjDays);
    total += proRata;
  }

  return total;
}

/**
 * Distribui o ajuste pro-rata DIA-A-DIA, retornando Map<YYYY-MM-DD, amount>.
 * Util para series diárias (CAC daily chart, spend daily chart).
 */
export function getMetaSpendAdjustmentByDay(
  market: Market,
  startDate: string,
  endDate: string
): Map<string, number> {
  const map = new Map<string, number>();

  for (const adj of MANUAL_ADJUSTMENTS) {
    if (adj.market !== market) continue;

    const periodStart = new Date(startDate + 'T00:00:00Z');
    const periodEnd = new Date(endDate + 'T00:00:00Z');
    const adjStart = new Date(adj.startDate + 'T00:00:00Z');
    const adjEnd = new Date(adj.endDate + 'T00:00:00Z');

    const overlapStart = periodStart > adjStart ? periodStart : adjStart;
    const overlapEnd = periodEnd < adjEnd ? periodEnd : adjEnd;
    if (overlapStart > overlapEnd) continue;

    const adjDays = Math.round((adjEnd.getTime() - adjStart.getTime()) / 86400000) + 1;
    const perDay = adj.amountUsd / adjDays;

    // Itera dia a dia no overlap
    for (
      let d = new Date(overlapStart);
      d <= overlapEnd;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const iso = d.toISOString().slice(0, 10);
      map.set(iso, (map.get(iso) || 0) + perDay);
    }
  }

  return map;
}

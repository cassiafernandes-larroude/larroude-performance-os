// Serviço que monta DailyPoint[] alinhado às regras de granularidade.
import { bucketDate, granularityFor, granularityForCustom, calcPeriod, inPeriodFlag, buildDateList, type Granularity, type PeriodKey, type PeriodRange } from './utils';

export interface DailyPoint { date: string; value: number; inPeriod?: boolean; }
export interface SeriesIn { date: string; value: number; }

export function granularityFromPeriod(periodKey: PeriodKey, customDays?: number): Granularity {
  if (periodKey === 'CUSTOM' && typeof customDays === 'number') return granularityForCustom(customDays);
  return granularityFor(periodKey);
}

// Bucketiza qualquer série daily em day/week/month e SOMA os valores.
export function bucketize(items: SeriesIn[], gran: Granularity): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of items) {
    const b = bucketDate(r.date, gran);
    m.set(b, (m.get(b) ?? 0) + (r.value || 0));
  }
  return m;
}

// Constrói DailyPoint[] usando SOMENTE buckets que vieram das fontes (evita barras vazias).
export function buildSeries(buckets: Map<string, number>, period: PeriodRange, extendShortPeriod = true): DailyPoint[] {
  // Se período < 7 dias, estende para mostrar 7 barras (contexto)
  const dateList = buildDateList(buckets.keys());
  let chartStart = period.start;
  if (extendShortPeriod && period.days < 7) {
    const end = new Date(period.end + 'T00:00:00Z');
    const minStart = new Date(end);
    minStart.setUTCDate(minStart.getUTCDate() - 6);
    chartStart = minStart.toISOString().slice(0, 10);
  }
  const start = chartStart < (dateList[0] ?? chartStart) ? chartStart : dateList[0] ?? chartStart;
  return dateList
    .filter(d => d >= start && d <= period.end)
    .map(date => ({
      date,
      value: buckets.get(date) ?? 0,
      inPeriod: inPeriodFlag(date, period)
    }));
}

// Helper combinado
export function makeDailySeries(items: SeriesIn[], periodKey: PeriodKey, opts?: { customDays?: number; endDate?: string }): { points: DailyPoint[]; granularity: Granularity; period: PeriodRange } {
  const period = calcPeriod(periodKey, opts?.endDate);
  const granularity = granularityFromPeriod(periodKey, opts?.customDays ?? period.days);
  const buckets = bucketize(items, granularity);
  const points = buildSeries(buckets, period, true);
  return { points, granularity, period };
}

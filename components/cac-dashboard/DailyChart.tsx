'use client';

import { useMemo } from 'react';
import BarLineChart from '@/components/shared/BarLineChart';
import type { DailyPoint, Market } from '@/lib/cac-dashboard/queries';

type Granularity = 'day' | 'week' | 'month';

function chooseGranularity(windowDays: number): Granularity {
  if (windowDays > 95) return 'month'; // 6M, 12M
  if (windowDays > 31) return 'week';  // 3M (90 days)
  return 'day';                         // 7D / 14D / 28D
}

interface Bucket {
  date: string;
  spend: number;
  newCustomers: number;
}

function aggregate(daily: DailyPoint[], granularity: Granularity): Bucket[] {
  if (granularity === 'day') {
    return daily.map((d) => ({
      date: d.date,
      spend: d.spend,
      newCustomers: d.newCustomers,
    }));
  }

  const buckets = new Map<string, Bucket>();

  for (const d of daily) {
    const date = new Date(d.date + 'T12:00:00Z');
    let key: string;

    if (granularity === 'month') {
      // primeiro dia do mes
      key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
    } else {
      // segunda-feira da semana ISO
      const dow = date.getUTCDay(); // 0=sun .. 6=sat
      const offset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() + offset);
      key = monday.toISOString().slice(0, 10);
    }

    const existing = buckets.get(key);
    if (existing) {
      existing.spend += d.spend;
      existing.newCustomers += d.newCustomers;
    } else {
      buckets.set(key, { date: key, spend: d.spend, newCustomers: d.newCustomers });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * CAC chart — barras unificadas com BarLineChart (chart.js).
 *
 * Regras aplicadas:
 *   - Granularidade automática baseada na largura da janela:
 *       7D / 14D / 28D → day
 *       3M             → week (segunda-feira)
 *       6M / 12M       → month (primeiro dia)
 *   - Aggregação: CAC = sum(spend) / sum(newCustomers) por bucket
 *     (recalcula no nível do bucket — não é média dos CACs diários)
 *   - Cor peach Larroudé (#d97757), modo `bare` (`.chart-card` CAC ja embrulha).
 */
export default function DailyChart({
  data,
  market,
  windowDays,
}: {
  data: DailyPoint[];
  market: Market;
  windowDays: number;
}) {
  const barData = useMemo(() => {
    if (!data.length) return [];
    const granularity = chooseGranularity(windowDays);
    const buckets = aggregate(data, granularity);
    return buckets.map((b) => ({
      date: b.date,
      // CAC recalculado no nível do bucket
      value: b.newCustomers > 0 ? b.spend / b.newCustomers : 0,
    }));
  }, [data, windowDays]);

  if (!barData.length) {
    return <div className="empty">Sem dados no período.</div>;
  }

  return (
    <BarLineChart
      title="CAC"
      data={barData}
      color="#d97757"
      unit="currency"
      market={market}
      height={280}
      bare
    />
  );
}

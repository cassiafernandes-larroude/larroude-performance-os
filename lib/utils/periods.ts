import type { Period } from "@/types/metric";

export function periodToDays(period: Period): number {
  switch (period) {
    case "7d": return 7;
    case "14d": return 14;
    case "28d": return 28;
    case "3M": return 90;
    case "6M": return 180;
    case "12M": return 365;
  }
}

export function dateRangeForPeriod(period: Period, today = new Date()): { from: string; to: string } {
  const days = periodToDays(period);
  const to = today;
  const from = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function previousPeriodRange(period: Period, today = new Date()): { from: string; to: string } {
  const days = periodToDays(period);
  const to = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function formatPeriodLabel(period: Period): string {
  const map: Record<Period, string> = {
    "7d": "7 dias",
    "14d": "14 dias",
    "28d": "28 dias",
    "3M": "3 meses",
    "6M": "6 meses",
    "12M": "12 meses",
  };
  return map[period];
}

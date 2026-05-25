import type { Period } from "@/types/metric";

export type Granularity = "day" | "week" | "month";

export function periodToDays(period: Period): number {
  switch (period) {
    case "today": return 1;
    case "7d": return 7;
    case "14d": return 14;
    case "28d": return 28;
    case "3M": return 90;
    case "6M": return 180;
    case "12M": return 365;
  }
}

// Granularidade dinamica baseada no tamanho da janela (regra do dashboard principal)
//   <= 28 dias  -> day
//   29-90 dias  -> week (DATE_TRUNC WEEK MONDAY)
//   > 90 dias   -> month
export function granularityForDays(days: number): Granularity {
  if (days <= 28) return "day";
  if (days <= 90) return "week";
  return "month";
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

// Calcula range "completo" (sem hoje) para um preset
export function dateRangeCompleted(period: Period, today = new Date()): { from: string; to: string } {
  const days = periodToDays(period);
  const to = new Date(today.getTime() - 24 * 3600 * 1000); // ontem
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Range anterior comparativo (mesma janela imediatamente antes)
export function previousRangeOf(from: string, to: string): { from: string; to: string } {
  const fromD = new Date(from);
  const toD = new Date(to);
  const days = Math.round((toD.getTime() - fromD.getTime()) / (24 * 3600 * 1000)) + 1;
  const prevTo = new Date(fromD.getTime() - 24 * 3600 * 1000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 24 * 3600 * 1000);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

// Numero de dias entre two dates inclusive
export function daysBetween(from: string, to: string): number {
  const fromD = new Date(from);
  const toD = new Date(to);
  return Math.round((toD.getTime() - fromD.getTime()) / (24 * 3600 * 1000)) + 1;
}

export function formatPeriodLabel(period: Period): string {
  const map: Record<Period, string> = {
    "today": "today",
    "7d": "7 days", "14d": "14 days", "28d": "28 days",
    "3M": "3 months", "6M": "6 months", "12M": "12 months",
  };
  return map[period];
}

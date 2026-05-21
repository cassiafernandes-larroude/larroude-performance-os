import type { Currency } from "@/types/metric";

const COMPACT_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const COMPACT_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 2,
});

const FULL_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const FULL_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("pt-BR");

export function formatCurrency(value: number, currency: Currency, compact = true): string {
  if (currency === "USD") return (compact ? COMPACT_USD : FULL_USD).format(value);
  if (currency === "BRL") return (compact ? COMPACT_BRL : FULL_BRL).format(value);
  return NUMBER.format(value);
}

export function formatNumber(value: number, opts?: { decimals?: number }): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: opts?.decimals ?? 0,
    maximumFractionDigits: opts?.decimals ?? 0,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatMultiplier(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}x`;
}

export function formatRatio(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}x`;
}

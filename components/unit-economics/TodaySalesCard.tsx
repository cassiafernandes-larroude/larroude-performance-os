'use client';

/**
 * Quadro de vendas de HOJE (D0) atualizadas, do produto selecionado.
 *
 * Cassia 2026-06-11: "consegue inserir um quadro de vendas de hoje,
 *                     atualizada, do produto selecionado?"
 *
 * Fonte: /api/unit-economics/{market}/today (cache TTL 5min)
 */

import type { ProductUnitEconomics } from '@/lib/unit-economics/queries';

interface TodaySnapshot {
  date: string;
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  products: { motherSku: string; units: number; orders: number; revenue: number }[];
  generatedAt: string;
}

interface ProductToday {
  motherSku: string;
  units: number;
  orders: number;
  revenue: number;
}

interface Props {
  today: TodaySnapshot | null;
  productToday: ProductToday | null;
  product: ProductUnitEconomics | null;
  currency: 'USD' | 'BRL';
  onRefresh: () => void;
}

function fmt(value: number, currency: 'USD' | 'BRL', compact: boolean = false): string {
  const symbol = currency === 'USD' ? '$' : 'R$';
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  }
  return `${symbol}${value.toLocaleString(currency === 'USD' ? 'en-US' : 'pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
  })}`;
}

function fmtTime(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function TodaySalesCard({
  today,
  productToday,
  product,
  currency,
  onRefresh,
}: Props) {
  const locale = currency === 'USD' ? 'en-US' : 'pt-BR';

  if (!product) {
    return (
      <section
        className="card mt-6 p-5"
        style={{ borderColor: '#fbbf24', background: '#fffbeb' }}
      >
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ea580c' }}>
          🟠 SALES TODAY — select a product
        </div>
      </section>
    );
  }

  const u = productToday?.units ?? 0;
  const o = productToday?.orders ?? 0;
  const rev = productToday?.revenue ?? 0;
  const aov = o > 0 ? rev / o : 0;
  const aupo = o > 0 ? u / o : 0;
  const dateLabel = today
    ? new Date(today.date + 'T00:00:00Z').toLocaleDateString(locale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

  return (
    <section
      className="card mt-6 p-3 sm:p-5"
      style={{ borderColor: '#fbbf24', background: '#fffbeb' }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ea580c' }}>
            🟠 SALES TODAY — {product.productName}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: '#92400e' }}>
            {dateLabel} · Live · 5min cache{' '}
            {today?.generatedAt && (
              <span style={{ opacity: 0.7 }}>· updated {fmtTime(today.generatedAt, locale)}</span>
            )}
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="pill pill-ghost px-3 py-1.5 text-[11px] flex items-center gap-1.5 font-medium"
          title="Refresh today's data"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
            <polyline points="21 3 21 9 15 9" />
            <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
            <polyline points="3 21 3 15 9 15" />
          </svg>
          Refresh now
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Cell label="Units" value={u.toLocaleString(locale)} tone="warn" />
        <Cell label="Orders" value={o.toLocaleString(locale)} tone="warn" />
        <Cell label="Gross revenue" value={fmt(rev, currency, true)} tone="warn" />
        <Cell
          label="Avg ticket"
          value={o > 0 ? fmt(aov, currency) : '—'}
          sub={o > 0 ? `${aupo.toFixed(1)} un/order` : ''}
          tone="warn"
        />
      </div>

      {/* Comparação com D-1 */}
      <div className="mt-3 text-[11px]" style={{ color: '#92400e' }}>
        <span>D-1 (yesterday): </span>
        <span style={{ fontWeight: 600 }}>
          {product.totalUnits.toLocaleString(locale)} un · {product.totalOrders.toLocaleString(locale)} ord.
          {product.totalUnits > 0 && (
            <span style={{ marginLeft: 8 }}>
              · {fmt(product.unitGrossRevenue, currency)} avg price
            </span>
          )}
        </span>
        {product.totalUnits > 0 && u !== product.totalUnits && (
          <span style={{ marginLeft: 8, color: u > product.totalUnits ? '#10b981' : '#dc2626' }}>
            {u > product.totalUnits ? '▲' : '▼'} {Math.abs(u - product.totalUnits).toLocaleString(locale)} un vs yesterday
          </span>
        )}
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'warn';
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: '#fff', border: '1px solid #fed7aa' }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: '#ea580c' }}
      >
        {label}
      </div>
      <div
        className="font-bold mt-1"
        style={{ color: '#111827', fontSize: 'clamp(20px, 2.2vw, 28px)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] mt-0.5" style={{ color: '#9ca3af' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

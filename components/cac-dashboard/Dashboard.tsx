'use client';

import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/main-dashboard/Header';
import DailyBarChart from '@/components/main-dashboard/DailyBarChart';
import KpiCard from './KpiCard';
import MonthlyChart from './MonthlyChart';
import ProductTable from './ProductTable';
import ProductTrendChart from './ProductTrendChart';
import ProductMatrixHeatmap from './ProductMatrixHeatmap';
import type { PeriodKey, PeriodRange, Market as MainMarket } from '@/lib/main-dashboard/types';
import { calcPeriod } from '@/lib/main-dashboard/utils';
import type {
  Market,
  KpiSummary,
  DailyPoint as CacDailyPoint,
  MonthlyPoint,
  ProductCac,
  ProductDailyPoint,
} from '@/lib/cac-dashboard/queries';
import { formatMoney, formatNumber } from '@/lib/cac-dashboard/format';

interface ApiResponse {
  summary: KpiSummary;
  daily: CacDailyPoint[];
  monthly: MonthlyPoint[];
  products: ProductCac[];
  productDaily: ProductDailyPoint[];
  meta?: { generatedAt: string; durationMs: number };
}

const STORAGE_KEY = 'lpos-cac-state-v1';

interface State {
  market: Market;
  period: PeriodKey;
  customStart?: string;
  customEnd?: string;
  isCustom?: boolean;
}

export default function Dashboard({ freshness }: { freshness: string }) {
  const [state, setState] = useState<State>({ market: 'US', period: '28d' });
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reidrata localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<State>;
      setState((s) => ({ ...s, ...saved }));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Calcula janela
  const periodRange: PeriodRange = useMemo(() => {
    if (state.isCustom && state.customStart && state.customEnd) {
      const s = new Date(state.customStart + 'T12:00:00').getTime();
      const e = new Date(state.customEnd + 'T12:00:00').getTime();
      const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
      const prevEndDate = new Date(s - 86400000);
      const prevStartDate = new Date(prevEndDate.getTime() - (days - 1) * 86400000);
      return {
        start: state.customStart,
        end: state.customEnd,
        days,
        prevStart: prevStartDate.toISOString().slice(0, 10),
        prevEnd: prevEndDate.toISOString().slice(0, 10),
      };
    }
    return calcPeriod(state.period, freshness || undefined);
  }, [state.period, state.isCustom, state.customStart, state.customEnd, freshness]);

  // Fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `/api/cac-native/${state.market}?start=${periodRange.start}&end=${periodRange.end}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Erro ao buscar dados');
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [state.market, periodRange.start, periodRange.end]);

  const summary = data?.summary;
  const windowDays = periodRange.days;

  // KPIs derivados de produtos (top volume / lower CAC)
  const productKpis = useMemo(() => {
    if (!data?.products?.length) return null;
    const byUnits = [...data.products].sort((a, b) => b.units - a.units);
    const top15Volume = byUnits.slice(0, 15);
    const minNew = windowDays <= 28 ? 20 : windowDays <= 60 ? 43 : 64;
    const top15Lower = [...data.products]
      .filter((p) => p.newCustomers >= minNew && p.cac > 0)
      .sort((a, b) => a.cac - b.cac)
      .slice(0, 15);
    const sum = (arr: typeof byUnits, key: 'allocatedSpend' | 'newCustomers') =>
      arr.reduce((s, p) => s + (p[key] || 0), 0);
    const tvSpend = sum(top15Volume, 'allocatedSpend');
    const tvNew = sum(top15Volume, 'newCustomers');
    const lcSpend = sum(top15Lower, 'allocatedSpend');
    const lcNew = sum(top15Lower, 'newCustomers');
    return {
      cacTopVolume: tvNew > 0 ? tvSpend / tvNew : 0,
      newTopVolume: tvNew,
      cacLowerCac: lcNew > 0 ? lcSpend / lcNew : 0,
      newLowerCac: lcNew,
      spendTopVolume: tvSpend,
      spendLowerCac: lcSpend,
    };
  }, [data, windowDays]);

  // Mapeia CacDailyPoint -> formato {date,value} consumido por DailyBarChart
  const dailyCac = useMemo(
    () => (data?.daily ?? []).map((d) => ({ date: d.date, value: d.cac })),
    [data?.daily]
  );
  const dailySpend = useMemo(
    () => (data?.daily ?? []).map((d) => ({ date: d.date, value: d.spend })),
    [data?.daily]
  );
  const dailyNewCust = useMemo(
    () => (data?.daily ?? []).map((d) => ({ date: d.date, value: d.newCustomers })),
    [data?.daily]
  );

  function handleRefresh() {
    setRefreshing(true);
    fetch(`/api/cac-native/${state.market}?start=${periodRange.start}&end=${periodRange.end}`, {
      cache: 'no-store',
    })
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((json) => {
        setData(json);
        setRefreshing(false);
      })
      .catch(() => setRefreshing(false));
  }

  function handleExportPdf() {
    if (typeof window !== 'undefined') window.print();
  }

  const bucketCount = dailyCac.length;
  const isCompact = bucketCount > 0 && bucketCount <= 14;
  const gridCls = isCompact ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4' : 'space-y-4 mt-4';

  return (
    <div className="main-dashboard-root">
      <Header
        market={state.market as MainMarket}
        period={state.period}
        customStart={state.customStart}
        customEnd={state.customEnd}
        isCustom={state.isCustom}
        onMarketChange={(m) => setState((s) => ({ ...s, market: m as Market }))}
        onPeriodChange={(p) => setState((s) => ({ ...s, period: p, isCustom: false }))}
        onCustomRange={(start, end) =>
          setState((s) => ({ ...s, customStart: start, customEnd: end, isCustom: true }))
        }
        onRefresh={handleRefresh}
        onExportPdf={handleExportPdf}
        refreshing={refreshing}
        periodRange={periodRange}
        title="CAC Dashboard"
        subtitleSuffix="Meta + Google Ads spend / new customers Shopify — period"
        lang="en"
      />

      {error && (
        <div
          className="card mt-2"
          style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}
        >
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* KPIs principais */}
      <section className="mt-6">
        <div className="kpi-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <KpiCard
            label="CAC"
            value={loading ? '-' : summary ? formatMoney(summary.cac, state.market, true) : '-'}
            sub="Spend total / new customers"
            highlight
          />
          <KpiCard
            label="Total Spend"
            value={loading ? '-' : summary ? formatMoney(summary.spend, state.market) : '-'}
            sub={
              summary
                ? `Meta ${formatMoney(summary.metaSpend, state.market)} · Google ${formatMoney(summary.googleSpend, state.market)}`
                : 'Meta + Google'
            }
          />
          <KpiCard
            label="New Customers"
            value={
              loading ? '-' : summary ? formatNumber(summary.newCustomers, state.market) : '-'
            }
            sub="Shopify · 1st order"
          />
          <KpiCard
            label="Orders"
            value={loading ? '-' : summary ? formatNumber(summary.orders, state.market) : '-'}
            sub="Shopify · non-cancelled"
          />
          <KpiCard
            label="Gross Revenue"
            value={loading ? '-' : summary ? formatMoney(summary.revenue, state.market) : '-'}
            sub="Shopify · current total price"
          />
          <KpiCard
            label="CPO"
            value={loading ? '-' : summary ? formatMoney(summary.cpo, state.market, true) : '-'}
            sub="Spend / orders"
          />
        </div>
      </section>

      {summary?.sources?.googleAds === 'bigquery_fallback' && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 14px',
            fontSize: 11,
            color: '#c0822a',
            background: '#fff7e0',
            border: '1px solid #f3e7c4',
            borderRadius: 8,
          }}
        >
          ⚠️ Google Ads via BigQuery fallback — fill <code>GADS_REFRESH_TOKEN</code> for direct API.
        </div>
      )}

      {/* Daily charts — usam DailyBarChart do Main Dashboard (chart.js, mesmo comportamento) */}
      <div className="text-xs font-bold uppercase tracking-[0.15em] text-ink mt-8 mb-4 flex items-center gap-2.5">
        <span className="inline-block w-1 h-4 bg-accent rounded-full" />
        💰 DAILY CAC — {state.market}
      </div>
      <div className={gridCls}>
        <DailyBarChart
          title="CAC Daily (Spend / New Customers)"
          data={dailyCac}
          color="#8b5cf6"
          unit="currency"
          market={state.market as MainMarket}
        />
        <DailyBarChart
          title="Ad Spend (Meta + Google)"
          data={dailySpend}
          color="#1f2d44"
          unit="currency"
          market={state.market as MainMarket}
        />
        <DailyBarChart
          title="New Customers Daily"
          data={dailyNewCust}
          color="#0d9488"
          unit="number"
          market={state.market as MainMarket}
        />
      </div>

      {/* Monthly chart (recharts, mantém porque é série 12M) */}
      <div className="text-xs font-bold uppercase tracking-[0.15em] text-ink mt-8 mb-4 flex items-center gap-2.5">
        <span className="inline-block w-1 h-4 bg-accent rounded-full" />
        📈 MONTHLY CAC — LAST 12 MONTHS — {state.market}
      </div>
      <div className="card" style={{ padding: 16 }}>
        {loading ? (
          <div className="empty" style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            Loading...
          </div>
        ) : data ? (
          <MonthlyChart data={data.monthly} market={state.market} />
        ) : (
          <div className="empty">-</div>
        )}
      </div>

      {/* CAC por produto */}
      <div className="text-xs font-bold uppercase tracking-[0.15em] text-ink mt-8 mb-4 flex items-center gap-2.5">
        <span className="inline-block w-1 h-4 bg-accent rounded-full" />
        👟 CAC BY PRODUCT — {state.market}
      </div>

      {productKpis && (
        <section className="mt-2 mb-4">
          <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard
              label="Blended CAC · Top Volume"
              value={formatMoney(productKpis.cacTopVolume, state.market, true)}
              sub={`Top 15 sellers · ${formatNumber(productKpis.newTopVolume, state.market)} new`}
              highlight
            />
            <KpiCard
              label="Blended CAC · Lower CAC"
              value={
                productKpis.cacLowerCac > 0
                  ? formatMoney(productKpis.cacLowerCac, state.market, true)
                  : '-'
              }
              sub={`Top 15 efficient · ${formatNumber(productKpis.newLowerCac, state.market)} new`}
              highlight
            />
            <KpiCard
              label="Spend Top Volume"
              value={formatMoney(productKpis.spendTopVolume, state.market)}
              sub={
                summary && summary.spend > 0
                  ? `${((productKpis.spendTopVolume / summary.spend) * 100).toFixed(1)}% of total`
                  : ''
              }
            />
            <KpiCard
              label="Spend Lower CAC"
              value={formatMoney(productKpis.spendLowerCac, state.market)}
              sub={
                summary && summary.spend > 0
                  ? `${((productKpis.spendLowerCac / summary.spend) * 100).toFixed(1)}% of total`
                  : ''
              }
            />
          </div>
        </section>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          Loading products...
        </div>
      ) : data ? (
        <>
          <ProductTable products={data.products} market={state.market} windowDays={windowDays} />
          <div style={{ marginTop: 16 }}>
            <ProductTrendChart
              productDaily={data.productDaily || []}
              products={data.products}
              market={state.market}
              startDate={periodRange.start}
              endDate={periodRange.end}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <ProductMatrixHeatmap
              productDaily={data.productDaily || []}
              products={data.products}
              market={state.market}
              startDate={periodRange.start}
              endDate={periodRange.end}
            />
          </div>
        </>
      ) : null}

      <footer
        className="mt-12 mb-4 text-[11px] text-center"
        style={{ color: '#9ca3af' }}
      >
        Larroudé · CAC Dashboard · Spend via Meta + Google Ads APIs · Orders via Shopify Admin
        GraphQL · Monthly 12M via BigQuery (
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          larroude-data-prod
        </span>
        ) · Updated daily at 08:00 BRT
      </footer>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Header from './Header';
import KpiCard from './KpiCard';
import PeriodFilter, { presetRange, type PeriodState } from './PeriodFilter';
import DailyChart from './DailyChart';
import ProductTable from './ProductTable';
import ProductTrendChart from './ProductTrendChart';
import ProductMatrixHeatmap from './ProductMatrixHeatmap';
import type {
  DailyPoint,
  KpiSummary,
  Market,
  MonthlyPoint,
  ProductCac,
  ProductDailyPoint,
} from '@/lib/cac-dashboard/queries';
import { formatMoney, formatNumber } from '@/lib/cac-dashboard/format';
import GenericDiagnosticsPanel from '@/components/shared/GenericDiagnosticsPanel';
import { computeGenericDiagnostics } from '@/lib/data/generic-diagnostics';

interface ApiResponse {
  summary: KpiSummary;
  daily: DailyPoint[];
  monthly: MonthlyPoint[];
  products: ProductCac[];
  productDaily: ProductDailyPoint[];
  meta?: { generatedAt: string; durationMs: number };
}

const STORAGE_KEY = 'lpos-cac-state-v2';

export default function Dashboard({ freshness }: { freshness: string }) {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodState>(() =>
    presetRange('28d', freshness || new Date().toISOString().slice(0, 10))
  );
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { market?: Market; period?: PeriodState };
      if (saved.market === 'US' || saved.market === 'BR') setMarket(saved.market);
      if (saved.period) setPeriod(saved.period);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ market, period }));
  }, [market, period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `/api/cac-native/${market}?start=${period.start}&end=${period.end}`;
    // cache: 'no-store' pra evitar resposta CDN/browser cacheada de janelas
    // anteriores. O memo-cache em processo (6h) do server ja acelera repeats.
    fetch(url, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Error fetching data');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [market, period.start, period.end]);

  const summary = data?.summary;

  const windowDays = useMemo(() => {
    const s = new Date(period.start + 'T12:00:00').getTime();
    const e = new Date(period.end + 'T12:00:00').getTime();
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  }, [period.start, period.end]);

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

  const periodLabel = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso + 'T12:00:00').toLocaleDateString(market === 'US' ? 'en-US' : 'pt-BR', {
        day: '2-digit',
        month: 'short',
      });
    return `${fmt(period.start)} → ${fmt(period.end)}`;
  }, [period.start, period.end, market]);

  return (
    <main className="page">
      <div className="container">
        <Header market={market} onMarketChange={setMarket} freshness={freshness} />

        <PeriodFilter
          value={period}
          onChange={setPeriod}
          maxDate={freshness || new Date().toISOString().slice(0, 10)}
        />

        {error && (
          <div
            className="card"
            style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Cassia 2026-06-13: Cause & Effect Diagnostics (período selecionado) */}
        {data?.daily && data.daily.length > 0 && (() => {
          const invSeries = data.daily.map((d) => ({ date: d.date, value: Number(d.spend) || 0 }));
          const outSeries = data.daily.map((d) => ({ date: d.date, value: Number(d.new_customers) || 0 }));
          const diag = computeGenericDiagnostics({
            domain: 'customer-acquisition',
            invName: 'spend',
            outName: 'new customers',
            efficiencyName: 'CAC',
            efficiencyUnit: '$',
            invSeries,
            outSeries,
            totalInv: summary?.spend,
            totalOut: summary?.new_customers,
            efficiency: summary?.cac,
            // CAC: quanto MENOR melhor — inverte healthy/critical
            efficiencyHealthyAt: -1, // não aplicável da mesma forma
            efficiencyCriticalAt: -1,
            fmt: market === 'BR'
              ? (v: number) => `R$${(v / 1000).toFixed(1)}k`
              : (v: number) => `$${(v / 1000).toFixed(1)}k`,
          });
          return <GenericDiagnosticsPanel diagnostics={diag} title={`CAUSE & EFFECT · ${periodLabel}`} />;
        })()}

        <div className="section-label">
          <span>📊</span>
          <span>Overall CAC · {market === 'US' ? 'United States' : 'Brazil'} · {periodLabel}</span>
        </div>

        <div className="kpi-grid">
          <KpiCard
            label="CAC"
            value={loading ? '—' : summary ? formatMoney(summary.cac, market, true) : '—'}
            sub="Total spend / new customers"
            highlight
          />
          <KpiCard
            label="Total spend"
            value={loading ? '—' : summary ? formatMoney(summary.spend, market) : '—'}
            sub={
              summary
                ? `Meta ${formatMoney(summary.metaSpend, market)} · Google ${formatMoney(summary.googleSpend, market)}`
                : 'Meta + Google'
            }
          />
          <KpiCard
            label="New customers"
            value={loading ? '—' : summary ? formatNumber(summary.newCustomers, market) : '—'}
            sub="Shopify · numberOfOrders == 1"
          />
          <KpiCard
            label="Orders"
            value={loading ? '—' : summary ? formatNumber(summary.orders, market) : '—'}
            sub="Shopify · non-cancelled"
          />
          <KpiCard
            label="Gross revenue"
            value={loading ? '—' : summary ? formatMoney(summary.revenue, market) : '—'}
            sub="Shopify · current total price"
          />
          <KpiCard
            label="CPO"
            value={loading ? '—' : summary ? formatMoney(summary.cpo, market, true) : '—'}
            sub="Spend / orders"
          />
        </div>

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
            ⚠️ Google Ads spend via BigQuery fallback — fill in <code>GADS_REFRESH_TOKEN</code> to use the direct API.
          </div>
        )}

        <div className="chart-card">
          <div className="chart-title">
            <h3>CAC · trend over period</h3>
            <span className="meta">{loading ? <span className="spinner" /> : null}</span>
          </div>
          <div className="chart-area">
            {loading ? (
              <div className="empty">Loading...</div>
            ) : data ? (
              <DailyChart data={data.daily} market={market} windowDays={windowDays} />
            ) : (
              <div className="empty">—</div>
            )}
          </div>
        </div>

        <div className="section-label">
          <span>👟</span>
          <span>CAC by product · {periodLabel}</span>
        </div>

        {productKpis && (
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <KpiCard
              label="CAC Blended · Top Volume"
              value={formatMoney(productKpis.cacTopVolume, market, true)}
              sub={`15 best sellers · ${formatNumber(productKpis.newTopVolume, market)} new`}
              highlight
            />
            <KpiCard
              label="CAC Blended · Lowest CAC"
              value={
                productKpis.cacLowerCac > 0
                  ? formatMoney(productKpis.cacLowerCac, market, true)
                  : '—'
              }
              sub={`15 most efficient · ${formatNumber(productKpis.newLowerCac, market)} new`}
              highlight
            />
            <KpiCard
              label="Spend Top Volume"
              value={formatMoney(productKpis.spendTopVolume, market)}
              sub={
                summary && summary.spend > 0
                  ? `${((productKpis.spendTopVolume / summary.spend) * 100).toFixed(1)}% of total`
                  : ''
              }
            />
            <KpiCard
              label="Spend Lowest CAC"
              value={formatMoney(productKpis.spendLowerCac, market)}
              sub={
                summary && summary.spend > 0
                  ? `${((productKpis.spendLowerCac / summary.spend) * 100).toFixed(1)}% of total`
                  : ''
              }
            />
          </div>
        )}

        {loading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <span className="spinner" />
            Loading products...
          </div>
        ) : data ? (
          <>
            <ProductTable products={data.products} market={market} windowDays={windowDays} />
            <div style={{ marginTop: 16 }}>
              <ProductTrendChart
                productDaily={data.productDaily || []}
                products={data.products}
                market={market}
                startDate={period.start}
                endDate={period.end}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <ProductMatrixHeatmap
                productDaily={data.productDaily || []}
                products={data.products}
                market={market}
                startDate={period.start}
                endDate={period.end}
              />
            </div>
          </>
        ) : null}

        <footer className="footer">
          Larroudé · CAC Dashboard · Spend via Meta Marketing API + Google Ads API · Orders via Shopify Admin GraphQL · 12M history via BigQuery (
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            larroude-data-platform
          </span>
          ) · refreshed daily at 08:00 BRT
        </footer>
      </div>
    </main>
  );
}

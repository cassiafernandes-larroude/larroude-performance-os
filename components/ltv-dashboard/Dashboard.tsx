'use client';

import { useEffect, useMemo, useState } from 'react';
import Header from './Header';
import KpiCard from './KpiCard';
import PeriodFilter, { presetRange, type PeriodState } from './PeriodFilter';
import DailyChart from './DailyChart';
import MonthlyChart from './MonthlyChart';
import LtvCacOverTimeChart from './LtvCacOverTimeChart';
import ProductLtvTable from './ProductLtvTable';
import ProductTrendChart from './ProductTrendChart';
import ProductMatrixHeatmap from './ProductMatrixHeatmap';
import CategoryLtvTable from './CategoryLtvTable';
import AnalysisBlock from './AnalysisBlock';
import RetentionBlock from './RetentionBlock';
import CustomerJourneyBlock from './CustomerJourneyBlock';
import type {
  CategoryLtv,
  CustomerJourney,
  DailyLtvPoint,
  LtvKpiSummary,
  Market,
  MonthlyLtvPoint,
  ProductLtv,
  ProductDailyPoint,
  RetentionStats,
} from '@/lib/ltv-dashboard/queries';
import { formatMoney, formatNumber, formatPercent } from '@/lib/ltv-dashboard/format';

interface ApiResponse {
  summary: LtvKpiSummary;
  daily: DailyLtvPoint[];
  monthly: MonthlyLtvPoint[];
  retention: RetentionStats;
  meta?: { generatedAt: string; durationMs: number };
}

interface ProductsApiResponse {
  products: ProductLtv[];
  productDaily: ProductDailyPoint[];
  categories: CategoryLtv[];
  meta?: { generatedAt: string; durationMs: number };
}

interface JourneyApiResponse {
  journey: CustomerJourney;
  meta?: { generatedAt: string; durationMs: number };
}

const STORAGE_KEY = 'larroude-ltv-state-v1';

export default function Dashboard({ freshness }: { freshness: string }) {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodState>(() =>
    presetRange('12M', freshness || new Date().toISOString().slice(0, 10))
  );
  const [data, setData] = useState<ApiResponse | null>(null);
  const [productsData, setProductsData] = useState<ProductsApiResponse | null>(null);
  const [journeyData, setJourneyData] = useState<JourneyApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingJourney, setLoadingJourney] = useState(true);
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

  // Fetch principal — KPIs + charts (rápido, ~3-8s)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `/api/ltv-native/${market}?start=${period.start}&end=${period.end}`;
    fetch(url)
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

  // Fetch lazy — produtos (lento, ~15-30s). Roda em paralelo, mas não bloqueia KPIs.
  useEffect(() => {
    let cancelled = false;
    setLoadingProducts(true);
    setProductsData(null);

    const url = `/api/ltv-native/${market}/products?start=${period.start}&end=${period.end}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ProductsApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setProductsData(json);
        setLoadingProducts(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [market, period.start, period.end]);

  // Fetch lazy — jornada do cliente (lifetime, não depende da janela).
  // Só re-fetch quando muda o market.
  useEffect(() => {
    let cancelled = false;
    setLoadingJourney(true);
    setJourneyData(null);

    fetch(`/api/ltv-native/${market}/journey`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<JourneyApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setJourneyData(json);
        setLoadingJourney(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingJourney(false);
      });

    return () => {
      cancelled = true;
    };
  }, [market]);

  const summary = data?.summary;

  const windowDays = useMemo(() => {
    const s = new Date(period.start + 'T12:00:00').getTime();
    const e = new Date(period.end + 'T12:00:00').getTime();
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  }, [period.start, period.end]);

  const periodLabel = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso + 'T12:00:00').toLocaleDateString(market === 'US' ? 'en-US' : 'pt-BR', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
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

        <div className="section-label">
          <span>{'\u{1F4B0}'}</span>
          <span>Overall LTV · {market === 'US' ? 'United States' : 'Brazil'} · {periodLabel}</span>
        </div>

        <div className="kpi-grid">
          <KpiCard
            label="Predictive LTV"
            value={
              loading
                ? '—'
                : summary
                ? formatMoney(summary.ltvPredictive, market, true)
                : '—'
            }
            sub={
              summary
                ? `AOV × Freq × Lifetime · ${formatNumber(summary.predictiveCustomers, market)} customers`
                : 'AOV × Purchase Frequency × Customer Lifetime'
            }
            highlight
          />
          <KpiCard
            label="Historical LTV"
            value={
              loading
                ? '—'
                : summary
                ? formatMoney(summary.ltvHistorical, market, true)
                : '—'
            }
            sub={
              summary
                ? `net_sales / ${formatNumber(summary.totalCustomers, market)} customers (incl. returns)`
                : 'net_sales / total customers'
            }
          />
          <KpiCard
            label="AOV"
            value={loading ? '—' : summary ? formatMoney(summary.aov, market, true) : '—'}
            sub={
              summary
                ? `${formatNumber(summary.totalOrders, market)} orders · net_sales / orders`
                : 'net_sales / orders'
            }
          />
          <KpiCard
            label="Purchase Frequency"
            value={
              loading
                ? '—'
                : summary
                ? summary.purchaseFrequency.toFixed(2)
                : '—'
            }
            sub="orders / customers in period"
          />
          <KpiCard
            label="Customer Lifetime"
            value={
              loading
                ? '—'
                : summary && summary.customerLifetime > 0
                ? `${summary.customerLifetime.toFixed(2)} a`
                : '—'
            }
            sub={
              summary
                ? `1 / (1 − ${summary.returningCustomerRate.toFixed(1)}% returning) · in years`
                : '1 / (1 − returning rate)'
            }
          />
          <KpiCard
            label="LTV / CAC"
            value={
              loading
                ? '—'
                : summary && summary.ltvCacRatio > 0
                ? summary.ltvCacRatio.toFixed(2)
                : '—'
            }
            sub={
              summary && summary.cac > 0
                ? `CAC ${formatMoney(summary.cac, market, true)} · healthy ≥ 3`
                : 'Meta+Google spend unavailable'
            }
            highlight
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
            ⚠️ Google Ads spend via BigQuery fallback — fill in <code>GADS_REFRESH_TOKEN</code> to use the direct API (affects LTV/CAC).
          </div>
        )}
        {summary?.sources?.googleAds === 'unavailable' && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 14px',
              fontSize: 11,
              color: '#8a8a8a',
              background: '#f5f3ee',
              border: '1px solid #e7e3da',
              borderRadius: 8,
            }}
          >
            ℹ️ Meta+Google spend unavailable for this period — LTV/CAC KPI not computed.
          </div>
        )}

        {/* Retenção — métricas absolutas, não dependem da janela */}
        <div className="section-label">
          <span>{'\u{1F501}'}</span>
          <span>Retention (full history · excludes exchanges and same product+color repurchases)</span>
        </div>
        <RetentionBlock retention={data?.retention} market={market} />

        <div className="charts-grid two-col">
          <div className="chart-card">
            <div className="chart-title">
              <h3>Daily AOV + Buyer LTV (last 28 days)</h3>
              <span className="meta">{loading ? <span className="spinner" /> : null}</span>
            </div>
            <div className="chart-area">
              {loading ? (
                <div className="empty">Loading...</div>
              ) : data ? (
                <DailyChart data={data.daily} market={market} />
              ) : (
                <div className="empty">—</div>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">
              <h3>Monthly LTV + Repeat Rate (rolling 12M)</h3>
              <span className="meta">history via BigQuery</span>
            </div>
            <div className="chart-area">
              {loading ? (
                <div className="empty">Loading...</div>
              ) : data ? (
                <MonthlyChart data={data.monthly} market={market} />
              ) : (
                <div className="empty">—</div>
              )}
            </div>
          </div>
        </div>

        {/* LTV/CAC overtime — chart com linha do ratio e referência 3x */}
        <div className="chart-card">
          <div className="chart-title">
            <h3>LTV / CAC overtime (last 12 months)</h3>
            <span className="meta">
              reference: 🟢 ≥3x healthy · 🔴 ≤1x breakeven
            </span>
          </div>
          <div className="chart-area" style={{ height: 300 }}>
            {loading ? (
              <div className="empty">Carregando...</div>
            ) : data ? (
              <LtvCacOverTimeChart data={data.monthly} market={market} />
            ) : (
              <div className="empty">—</div>
            )}
          </div>
        </div>

        {/* Distribuição de LTV — percentis */}
        {summary && (
          <>
            <div className="section-label">
              <span>{'\u{1F4CA}'}</span>
              <span>LTV Distribution · {periodLabel}</span>
            </div>
            <div className="kpi-grid">
              <KpiCard
                label="Median LTV (P50)"
                value={formatMoney(summary.ltvMedian, market, true)}
                sub="50% of customers spend up to this value"
              />
              <KpiCard
                label="LTV P75"
                value={formatMoney(summary.ltvP75, market, true)}
                sub="Top 25% spend above this value"
              />
              <KpiCard
                label="LTV P90"
                value={formatMoney(summary.ltvP90, market, true)}
                sub="Top 10% — high-value customers"
              />
            </div>
          </>
        )}

        <div className="section-label">
          <span>{'\u{1F45F}'}</span>
          <span>LTV by product · {periodLabel}</span>
        </div>

        {loadingProducts ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <span className="spinner" />
            Loading products... (first load may take 15-30s)
          </div>
        ) : productsData ? (
          <>
            <ProductLtvTable
              products={productsData.products}
              market={market}
              windowDays={windowDays}
            />
            <div style={{ marginTop: 16 }}>
              <CategoryLtvTable
                categories={productsData.categories || []}
                market={market}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <ProductTrendChart
                productDaily={productsData.productDaily || []}
                products={productsData.products}
                market={market}
                startDate={period.start}
                endDate={period.end}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <ProductMatrixHeatmap
                productDaily={productsData.productDaily || []}
                products={productsData.products}
                market={market}
                startDate={period.start}
                endDate={period.end}
              />
            </div>
          </>
        ) : null}

        {/* Jornada do Cliente — produtos de entrada, 2ª/3ª compra, transições */}
        <div className="section-label">
          <span>{'\u{1F6D2}'}</span>
          <span>Customer Journey · full history · only repurchases of a different color (excludes exchanges and returned line items)</span>
        </div>
        <CustomerJourneyBlock
          journey={journeyData?.journey ?? null}
          market={market}
          loading={loadingJourney}
        />

        {/* Análise & Recomendações — depois de tudo, com base em todos os KPIs */}
        {!loading && summary && (
          <div>
            <div className="section-label">
              <span>{'\u{1F4A1}'}</span>
              <span>Analysis & Recommendations</span>
            </div>
            <AnalysisBlock
              summary={summary}
              categories={productsData?.categories ?? null}
              market={market}
              journey={journeyData?.journey ?? null}
            />
          </div>
        )}

        <footer className="footer">
          Larroudé · LTV Dashboard · Orders via BigQuery (
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            larroude-data-platform.shopify_&lt;market&gt;.orders
          </span>
          ) · Meta+Google APIs spend (LTV/CAC) · refreshed daily at 08:00 BRT
        </footer>
      </div>
    </main>
  );
}

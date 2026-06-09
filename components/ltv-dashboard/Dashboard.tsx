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
        setError(err.message || 'Erro ao buscar dados');
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
    fetch(url, { cache: 'no-store' })
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

    fetch(`/api/ltv-native/${market}/journey`, { cache: 'no-store' })
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
            <strong>Erro:</strong> {error}
          </div>
        )}

        <div className="section-label">
          <span>{'\u{1F4B0}'}</span>
          <span>LTV Geral · {market === 'US' ? 'United States' : 'Brasil'} · {periodLabel}</span>
        </div>

        <div className="kpi-grid">
          <KpiCard
            label="LTV Preditivo"
            value={
              loading
                ? '—'
                : summary
                ? formatMoney(summary.ltvPredictive, market, true)
                : '—'
            }
            sub={
              summary
                ? `AOV × Freq × Lifetime · ${formatNumber(summary.predictiveCustomers, market)} clientes`
                : 'AOV × Purchase Frequency × Customer Lifetime'
            }
            highlight
          />
          <KpiCard
            label="LTV Histórico"
            value={
              loading
                ? '—'
                : summary
                ? formatMoney(summary.ltvHistorical, market, true)
                : '—'
            }
            sub={
              summary
                ? `net_sales / ${formatNumber(summary.totalCustomers, market)} clientes (inclui retornos)`
                : 'net_sales / total customers'
            }
          />
          <KpiCard
            label="AOV"
            value={loading ? '—' : summary ? formatMoney(summary.aov, market, true) : '—'}
            sub={
              summary
                ? `${formatNumber(summary.totalOrders, market)} pedidos · net_sales / orders`
                : 'net_sales / orders'
            }
          />
          <KpiCard
            label="Frequência de compra"
            value={
              loading
                ? '—'
                : summary
                ? summary.purchaseFrequency.toFixed(2)
                : '—'
            }
            sub="orders / customers no período"
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
                ? `1 / (1 − ${summary.returningCustomerRate.toFixed(1)}% returning) · em anos`
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
                ? `CAC ${formatMoney(summary.cac, market, true)} · saudável ≥ 3`
                : 'Spend Meta+Google indisponível'
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
            ⚠️ Google Ads spend via fallback BigQuery — preencha <code>GADS_REFRESH_TOKEN</code> para usar a API direta (afeta o LTV/CAC).
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
            ℹ️ Spend Meta+Google indisponível neste período — KPI LTV/CAC não calculado.
          </div>
        )}

        {/* Retenção — métricas absolutas, não dependem da janela */}
        <div className="section-label">
          <span>{'\u{1F501}'}</span>
          <span>Retenção (histórico completo · exclui trocas e recompras de mesmo produto+cor)</span>
        </div>
        <RetentionBlock retention={data?.retention} market={market} />

        <div className="charts-grid two-col">
          <div className="chart-card">
            <div className="chart-title">
              <h3>AOV diário + LTV dos compradores (últimos 28 dias)</h3>
              <span className="meta">{loading ? <span className="spinner" /> : null}</span>
            </div>
            <div className="chart-area">
              {loading ? (
                <div className="empty">Carregando...</div>
              ) : data ? (
                <DailyChart data={data.daily} market={market} />
              ) : (
                <div className="empty">—</div>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">
              <h3>LTV mensal + Repeat Rate (rolling 12M)</h3>
              <span className="meta">histórico via BigQuery</span>
            </div>
            <div className="chart-area">
              {loading ? (
                <div className="empty">Carregando...</div>
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
            <h3>LTV / CAC overtime (últimos 12 meses)</h3>
            <span className="meta">
              referência: 🟢 ≥3x saudável · 🔴 ≤1x breakeven
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
              <span>Distribuição de LTV · {periodLabel}</span>
            </div>
            <div className="kpi-grid">
              <KpiCard
                label="LTV Mediano (P50)"
                value={formatMoney(summary.ltvMedian, market, true)}
                sub="50% dos clientes gastam até esse valor"
              />
              <KpiCard
                label="LTV P75"
                value={formatMoney(summary.ltvP75, market, true)}
                sub="Top 25% gasta acima desse valor"
              />
              <KpiCard
                label="LTV P90"
                value={formatMoney(summary.ltvP90, market, true)}
                sub="Top 10% — clientes high-value"
              />
            </div>
          </>
        )}

        <div className="section-label">
          <span>{'\u{1F45F}'}</span>
          <span>LTV por produto · {periodLabel}</span>
        </div>

        {loadingProducts ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <span className="spinner" />
            Carregando produtos... (a primeira carga pode levar 15-30s)
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
          <span>Jornada do Cliente · histórico completo · só recompras de cor diferente (exclui trocas e line items devolvidos)</span>
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
              <span>Análise & Recomendações</span>
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
          Larroudé · LTV Dashboard · Pedidos via BigQuery (
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            larroude-data-platform.shopify_&lt;market&gt;.orders
          </span>
          ) · Spend Meta+Google APIs (LTV/CAC) · atualizado diariamente às 08:00 BRT
        </footer>
      </div>
    </main>
  );
}

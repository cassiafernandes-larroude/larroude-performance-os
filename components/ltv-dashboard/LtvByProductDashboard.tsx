'use client';
// Cassia 2026-06-21: Aba "LTV por Produto" — cópia das seções "LTV by product" + "Customer Journey"
// da aba LTV, reusando os MESMOS componentes (ProductLtvTable/CategoryLtvTable/ProductTrendChart/
// ProductMatrixHeatmap/CustomerJourneyBlock) e as MESMAS rotas (/api/ltv-native/[market]/products
// e /journey). Nada de query nova — só recompõe os blocos pedidos numa página dedicada.

import { useEffect, useMemo, useState } from 'react';
import Header from './Header';
import PeriodFilter, { presetRange, type PeriodState } from './PeriodFilter';
import ProductLtvTable from './ProductLtvTable';
import ProductTrendChart from './ProductTrendChart';
import ProductMatrixHeatmap from './ProductMatrixHeatmap';
import CategoryLtvTable from './CategoryLtvTable';
import CustomerJourneyBlock from './CustomerJourneyBlock';
import type {
  CategoryLtv,
  CustomerJourney,
  Market,
  ProductLtv,
  ProductDailyPoint,
} from '@/lib/ltv-dashboard/queries';

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

const STORAGE_KEY = 'larroude-ltv-product-state-v1';

export default function LtvByProductDashboard({ freshness }: { freshness: string }) {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodState>(() =>
    presetRange('12M', freshness || new Date().toISOString().slice(0, 10))
  );
  const [productsData, setProductsData] = useState<ProductsApiResponse | null>(null);
  const [journeyData, setJourneyData] = useState<JourneyApiResponse | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingJourney, setLoadingJourney] = useState(true);

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

  // Produtos (lento, ~15-30s no cold). Re-fetch quando muda market/período.
  useEffect(() => {
    let cancelled = false;
    setLoadingProducts(true);
    setProductsData(null);
    fetch(`/api/ltv-native/${market}/products?start=${period.start}&end=${period.end}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<ProductsApiResponse>; })
      .then((json) => { if (!cancelled) { setProductsData(json); setLoadingProducts(false); } })
      .catch(() => { if (!cancelled) setLoadingProducts(false); });
    return () => { cancelled = true; };
  }, [market, period.start, period.end]);

  // Jornada (lifetime — só depende do market).
  useEffect(() => {
    let cancelled = false;
    setLoadingJourney(true);
    setJourneyData(null);
    fetch(`/api/ltv-native/${market}/journey`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<JourneyApiResponse>; })
      .then((json) => { if (!cancelled) { setJourneyData(json); setLoadingJourney(false); } })
      .catch(() => { if (!cancelled) setLoadingJourney(false); });
    return () => { cancelled = true; };
  }, [market]);

  const windowDays = useMemo(() => {
    const s = new Date(period.start + 'T12:00:00').getTime();
    const e = new Date(period.end + 'T12:00:00').getTime();
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  }, [period.start, period.end]);

  const periodLabel = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso + 'T12:00:00').toLocaleDateString(market === 'US' ? 'en-US' : 'pt-BR', {
        day: '2-digit', month: 'short', year: '2-digit',
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

        {/* ===== LTV by product ===== */}
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
            <ProductLtvTable products={productsData.products} market={market} windowDays={windowDays} />
            <div style={{ marginTop: 16 }}>
              <CategoryLtvTable categories={productsData.categories || []} market={market} />
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

        {/* ===== Customer Journey ===== */}
        <div className="section-label">
          <span>{'\u{1F6D2}'}</span>
          <span>Customer Journey · full history · only repurchases of a different color (excludes exchanges and returned line items)</span>
        </div>
        <CustomerJourneyBlock
          journey={journeyData?.journey ?? null}
          market={market}
          loading={loadingJourney}
        />
      </div>
    </main>
  );
}

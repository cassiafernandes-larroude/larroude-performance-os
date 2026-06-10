'use client';

import { useEffect, useMemo, useState } from 'react';
import UeHeader from './UeHeader';
import { computeCascade, DEFAULT_ASSUMPTIONS, type Assumptions } from '@/lib/unit-economics/cascade';
import type { ProductUnitEconomics, Market } from '@/lib/unit-economics/queries';
import AssumptionsPanel from './AssumptionsPanel';
import CascadeView from './CascadeView';
import KpiCards from './KpiCards';
import ProductSelector from './ProductSelector';

interface ApiResponse {
  market: Market;
  startDate: string;
  endDate: string;
  currency: 'USD' | 'BRL';
  totalUnits: number;
  totalOrders: number;
  totalRevenue: number;
  totalRefunds: number;
  totalMarketingSpend: number;
  metaSpend: number;
  googleSpend: number;
  marketingCoverage: number;
  marketingPerUnit: number;
  partial?: boolean;
  pagesProcessed?: number;
  products: ProductUnitEconomics[];
  variants: ProductUnitEconomics[];
  meta?: { generatedAt: string; durationMs: number };
}

const STATE_KEY = 'lpos-ue-state-v2'; // bump from v1 (schema mudou — sem period)

interface State {
  market: Market;
  selectedMotherSku: string | null;
  assumptions: Record<Market, Assumptions>;
}

export default function Dashboard({ freshness }: { freshness: string }) {
  const [state, setState] = useState<State>({
    market: 'US',
    selectedMotherSku: null,
    assumptions: { US: { ...DEFAULT_ASSUMPTIONS.US }, BR: { ...DEFAULT_ASSUMPTIONS.BR } },
  });
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // localStorage rehydrate
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<State>;
        setState((s) => ({
          ...s,
          ...saved,
          assumptions: { ...s.assumptions, ...(saved.assumptions || {}) },
        }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state]);

  // Fetch — janela é decidida pelo backend (60d rolling).
  function fetchData(force: boolean = false) {
    setLoading(true);
    setError(null);
    const url = `/api/unit-economics/${state.market}${force ? `?_=${Date.now()}` : ''}`;
    return fetch(url, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
        setRefreshing(false);
        if (!state.selectedMotherSku && json.products?.[0]) {
          setState((s) => ({ ...s, selectedMotherSku: json.products[0].motherSku }));
        }
      })
      .catch((err: Error) => {
        setError(err.message || 'Erro ao buscar dados');
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/unit-economics/${state.market}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
        if (!state.selectedMotherSku && json.products?.[0]) {
          setState((s) => ({ ...s, selectedMotherSku: json.products[0].motherSku }));
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Erro ao buscar dados');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.market]);

  function handleRefresh() {
    setRefreshing(true);
    fetchData(true);
  }
  function handleExportPdf() {
    if (typeof window !== 'undefined') window.print();
  }

  // Produto selecionado + cascata
  const selectedProduct = useMemo(() => {
    if (!data || !state.selectedMotherSku) return null;
    return (
      data.products.find((p) => p.motherSku === state.selectedMotherSku) ?? data.products[0] ?? null
    );
  }, [data, state.selectedMotherSku]);

  const selectedVariants = useMemo(() => {
    if (!data || !state.selectedMotherSku) return [];
    return data.variants.filter((v) => v.motherSku === state.selectedMotherSku);
  }, [data, state.selectedMotherSku]);

  const assumptions = state.assumptions[state.market];

  const cascade = useMemo(() => {
    if (!selectedProduct || !data) return null;
    return computeCascade(selectedProduct, assumptions, state.market, data.marketingPerUnit);
  }, [selectedProduct, assumptions, state.market, data]);

  const variantCascades = useMemo(() => {
    if (!data) return [];
    return selectedVariants.map((v) => ({
      variant: v,
      cascade: computeCascade(v, assumptions, state.market, data.marketingPerUnit),
    }));
  }, [selectedVariants, assumptions, state.market, data]);

  return (
    <div className="main-dashboard-root">
      <UeHeader
        market={state.market}
        onMarketChange={(m) => setState((s) => ({ ...s, market: m, selectedMotherSku: null }))}
        onRefresh={handleRefresh}
        onExportPdf={handleExportPdf}
        refreshing={refreshing}
        startDate={data?.startDate}
        endDate={data?.endDate}
      />

      {error && (
        <div
          className="card mt-4 p-4"
          style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}
        >
          <strong>Erro:</strong> {error}
        </div>
      )}

      {loading && !data && (
        <div className="card mt-4 p-8 text-center text-sm" style={{ color: '#6b7280' }}>
          Carregando dados de hoje do Shopify… (cache 30min depois da 1ª carga)
        </div>
      )}

      {data && data.partial && (
        <div
          className="card mt-4 p-3 text-sm"
          style={{ borderColor: '#d97706', background: '#fffbeb', color: '#92400e' }}
        >
          <strong>⚠ Dados parciais:</strong> processadas {data.pagesProcessed} páginas (
          {data.totalOrders.toLocaleString('en-US')} orders) antes do limite de tempo. Médias por
          unidade ainda são representativas.
        </div>
      )}

      {data && (
        <>
          <KpiCards data={data} cascade={cascade} />

          <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-4 mt-6">
            <ProductSelector
              products={data.products}
              variants={data.variants}
              selectedMotherSku={state.selectedMotherSku}
              onSelect={(motherSku) => setState((s) => ({ ...s, selectedMotherSku: motherSku }))}
              currency={data.currency}
            />
            <div>
              {selectedProduct && cascade ? (
                <CascadeView
                  product={selectedProduct}
                  cascade={cascade}
                  variantCascades={variantCascades}
                  currency={data.currency}
                />
              ) : (
                <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>
                  Selecione um produto para ver a cascata.
                </div>
              )}
            </div>
          </div>

          <AssumptionsPanel
            assumptions={assumptions}
            market={state.market}
            onChange={(next) =>
              setState((s) => ({
                ...s,
                assumptions: { ...s.assumptions, [state.market]: next },
              }))
            }
            onReset={() =>
              setState((s) => ({
                ...s,
                assumptions: {
                  ...s.assumptions,
                  [state.market]: { ...DEFAULT_ASSUMPTIONS[state.market] },
                },
              }))
            }
          />
        </>
      )}
    </div>
  );
}

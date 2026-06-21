'use client';

// Main Dashboard nativo - replica completa do larroude-dashboard-performance.vercel.app.
// Substitui o iframe externo. Componentes em components/main-dashboard/* e
// data layer em lib/main-dashboard/*. API em /api/dashboard-principal/data.

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/main-dashboard/Header';
import Dashboard from '@/components/main-dashboard/Dashboard';
import type { DashboardPayload, Market, PeriodKey } from '@/lib/main-dashboard/types';
import { FULFILLMENT_CATEGORY_GROUPS, type FulfillmentCategory } from '@/lib/shared/fulfillment-category';

export default function DashboardPrincipalPage() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodKey>('28d');
  const [customStart, setCustomStart] = useState<string | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<string | undefined>(undefined);
  const [isCustom, setIsCustom] = useState(false);
  const [fulCats, setFulCats] = useState<FulfillmentCategory[]>([]);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(
    async (m: Market, p: PeriodKey, cs?: string, ce?: string, bust = false, fc: FulfillmentCategory[] = []) => {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/dashboard-principal/data?market=${m}&period=${p}`;
        if (cs && ce) url += `&start=${cs}&end=${ce}`;
        if (fc.length) url += `&fulCats=${fc.join(',')}`;
        if (bust) url += `&t=${Date.now()}`;
        const res = await fetch(url, { cache: bust ? 'no-store' : 'default' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e?.message || 'Erro ao carregar dados');
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchData(
      market,
      period,
      isCustom ? customStart : undefined,
      isCustom ? customEnd : undefined,
      false,
      fulCats
    );
  }, [market, period, isCustom, customStart, customEnd, fulCats, fetchData]);

  function handlePeriodChange(p: PeriodKey) {
    setIsCustom(false);
    setPeriod(p);
  }

  function handleCustomRange(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
    setIsCustom(true);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch('/api/dashboard-principal/refresh', { method: 'POST' });
    } catch {
      // Refresh sem efeito - segue pra fetch direto
    }
    await fetchData(
      market,
      period,
      isCustom ? customStart : undefined,
      isCustom ? customEnd : undefined,
      true,
      fulCats
    );
  }

  function handleExportPdf() {
    window.print();
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 print-container main-dashboard-root">
      <Header
        market={market}
        period={period}
        customStart={customStart}
        customEnd={customEnd}
        isCustom={isCustom}
        onMarketChange={setMarket}
        onPeriodChange={handlePeriodChange}
        onCustomRange={handleCustomRange}
        onRefresh={handleRefresh}
        onExportPdf={handleExportPdf}
        refreshing={refreshing}
        generatedAt={data?.generatedAt}
        periodRange={data?.period}
      />

      <div className="flex items-center gap-1.5 mt-3 flex-wrap no-print">
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: '#9ca3af' }}>ORIGEM</span>
        <button
          onClick={() => setFulCats([])}
          className={`pill ${fulCats.length === 0 ? 'pill-active' : 'pill-inactive'} px-3 py-1 text-[12px]`}
        >
          Todos
        </button>
        {FULFILLMENT_CATEGORY_GROUPS.map((g) => {
          const active = g.cats.every((c) => fulCats.includes(c));
          return (
            <button
              key={g.key}
              onClick={() =>
                setFulCats((prev) => {
                  const set = new Set(prev);
                  if (g.cats.every((c) => set.has(c))) g.cats.forEach((c) => set.delete(c));
                  else g.cats.forEach((c) => set.add(c));
                  return [...set];
                })
              }
              className={`pill ${active ? 'pill-active' : 'pill-inactive'} px-3 py-1 text-[12px]`}
            >
              {g.label}
            </button>
          );
        })}
        {fulCats.length > 0 && (
          <span className="text-[11px]" style={{ color: '#9ca3af' }}>
            KPIs, ROAS e gráficos diários por origem · channel share = total
          </span>
        )}
      </div>

      {data?.originShare && data.originShare.totalUnits > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {([
            { label: 'SHARE — IN STOCK', d: data.originShare.inStock, color: '#16A34A' },
            { label: 'SHARE — ON-DEMAND', d: data.originShare.onDemand, color: '#F59E0B' },
            { label: 'SHARE — PRE-ORDER', d: data.originShare.preOrder, color: '#FF3D8B' },
          ] as const).map((c) => (
            <div key={c.label} className="card p-4" style={{ borderTop: `3px solid ${c.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280' }}>{c.label}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: '#111827', lineHeight: 1.1, marginTop: 4 }}>
                {(c.d.unitsShare * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {c.d.units.toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')} items · {c.d.orders.toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')} pedidos · {market === 'US' ? '$' : 'R$'}
                {Math.round(c.d.revenue).toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')} ({(c.d.revenueShare * 100).toFixed(1)}% receita)
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card mt-4 p-4 border-l-4" style={{ borderLeftColor: '#ef4444' }}>
          <div className="text-sm font-medium" style={{ color: '#ef4444' }}>
            Erro ao carregar dados
          </div>
          <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {error}
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="card mt-4 p-8 text-center text-sm" style={{ color: '#6b7280' }}>
          Loading BigQuery data...
        </div>
      )}

      {data && <Dashboard data={data} dimmed={loading} />}

      <footer className="mt-8 mb-4 text-xs text-center" style={{ color: '#6b7280' }}>
        Larroude Analytics - {market} - BigQuery (Larroude OS) - Meta Ads + Google Ads + Shopify + Klaviyo
      </footer>
    </main>
  );
}

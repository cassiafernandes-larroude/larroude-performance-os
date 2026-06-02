'use client';

// Channel Share - mostra 2 graficos diarios por canal (receita + participacao %).
// Usa os mesmos filtros e o mesmo payload do Main Dashboard.

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/main-dashboard/Header';
import ChannelShareGrid from '@/components/main-dashboard/ChannelShareGrid';
import type { DashboardPayload, Market, PeriodKey } from '@/lib/main-dashboard/types';

export default function ChannelSharePage() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodKey>('28d');
  const [customStart, setCustomStart] = useState<string | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<string | undefined>(undefined);
  const [isCustom, setIsCustom] = useState(false);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(
    async (m: Market, p: PeriodKey, cs?: string, ce?: string, bust = false) => {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/dashboard-principal/data?market=${m}&period=${p}`;
        if (cs && ce) url += `&start=${cs}&end=${ce}`;
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
      isCustom ? customEnd : undefined
    );
  }, [market, period, isCustom, customStart, customEnd, fetchData]);

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
      // ok
    }
    await fetchData(
      market,
      period,
      isCustom ? customStart : undefined,
      isCustom ? customEnd : undefined,
      true
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

      {error && (
        <div className="card mt-4 p-4 border-l-4" style={{ borderLeftColor: '#ef4444' }}>
          <div className="text-sm font-medium" style={{ color: '#ef4444' }}>
            Erro ao carregar dados
          </div>
          <div className="text-xs mt-1" style={{ color: '#6b7280' }}>{error}</div>
        </div>
      )}

      {loading && !data && (
        <div className="card mt-4 p-8 text-center text-sm" style={{ color: '#6b7280' }}>
          Carregando dados do BigQuery...
        </div>
      )}

      {data && <ChannelShareGrid data={data} dimmed={loading} />}

      <footer className="mt-8 mb-4 text-xs text-center" style={{ color: '#6b7280' }}>
        Larroude Analytics - {market} - BigQuery (Larroude OS) - Channel Share Daily
      </footer>
    </main>
  );
}

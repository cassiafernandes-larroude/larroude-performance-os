'use client';

// Aba Performance de Produto (robusta) — Cassia 2026-06-17.
// KPIs do periodo + ranking de produtos (best sellers, clicavel) + drill-down do produto
// selecionado (unidades + faturamento ao longo do tempo, formato BarLineChart).
// Fontes: /api/product-performance/[market] (ranking+totais) + /api/unit-economics/[market]/timeseries.

import { useEffect, useMemo, useState } from 'react';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import type { Period } from '@/types/metric';

type Market = 'US' | 'BR';
const PRESETS: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

interface ProductRow { motherSku: string; name: string; category: string; units: number; revenue: number; }
interface Bucket { date: string; units: number; grossRevenue: number; discount: number; }

export default function ProductPerformancePage() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<Period>('28d');
  const [sortBy, setSortBy] = useState<'revenue' | 'units'>('revenue');
  const [search, setSearch] = useState('');
  const [perf, setPerf] = useState<{ totalUnits: number; totalRevenue: number; productCount: number; products: ProductRow[]; start?: string; end?: string } | null>(null);
  const [loadingPerf, setLoadingPerf] = useState(true);
  const [sku, setSku] = useState<string>('');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);

  const cur = market === 'US' ? '$' : 'R$';
  const loc = market === 'US' ? 'en-US' : 'pt-BR';
  const fmtMoney = (v: number) => `${cur}${Math.round(v).toLocaleString(loc)}`;
  const fmtNum = (v: number) => v.toLocaleString(loc);

  // Ranking + totais
  useEffect(() => {
    let cancelled = false;
    setLoadingPerf(true);
    fetch(`/api/product-performance/${market}?period=${period}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setPerf(j);
        const top = (j.products || [])[0]?.motherSku || '';
        setSku((prev) => (prev && (j.products || []).some((p: ProductRow) => p.motherSku === prev) ? prev : top));
        setLoadingPerf(false);
      })
      .catch(() => setLoadingPerf(false));
    return () => { cancelled = true; };
  }, [market, period]);

  // Série temporal do produto selecionado
  useEffect(() => {
    if (!sku) { setBuckets([]); return; }
    let cancelled = false;
    setLoadingSeries(true);
    fetch(`/api/unit-economics/${market}/timeseries?sku=${encodeURIComponent(sku)}&period=${period}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { buckets: Bucket[] }) => { if (!cancelled) { setBuckets(j.buckets || []); setLoadingSeries(false); } })
      .catch(() => setLoadingSeries(false));
    return () => { cancelled = true; };
  }, [market, sku, period]);

  const products = perf?.products || [];
  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...products]
      .filter((p) => !q || p.motherSku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .sort((a, b) => (sortBy === 'units' ? b.units - a.units : b.revenue - a.revenue))
      .slice(0, 50);
  }, [products, search, sortBy]);

  const unitPoints: BarPoint[] = useMemo(() => buckets.filter((b) => b.units > 0).map((b) => ({ date: b.date, value: b.units })), [buckets]);
  const revPoints: BarPoint[] = useMemo(() => buckets.filter((b) => b.units > 0).map((b) => ({ date: b.date, value: Math.round((b.grossRevenue - (b.discount || 0)) * 100) / 100 })), [buckets]);

  const sel = products.find((p) => p.motherSku === sku);
  const totalUnits = perf?.totalUnits || 0;
  const totalRev = perf?.totalRevenue || 0;
  const ticket = totalUnits > 0 ? totalRev / totalUnits : 0;
  const pillBtn = (active: boolean) => `pill ${active ? 'pill-active' : 'pill-inactive'} px-3 py-1.5 text-[12px] ${active ? 'font-medium' : ''}`;

  return (
    <main className="main-dashboard-root mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <div className="mb-4">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: '#1A1A1A' }}>Performance de Produto</h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: '#4A4A4A' }}>
          Best sellers, ranking e evolução por produto — via BigQuery Larroude OS
          {perf?.start && <> · {perf.start} → {perf.end}</>}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <button onClick={() => setMarket('US')} className={pillBtn(market === 'US')}>US</button>
        <button onClick={() => setMarket('BR')} className={pillBtn(market === 'BR')}>BR</button>
        <span style={{ width: 1, height: 22, background: '#E5E0D6', margin: '0 4px' }} />
        <span className="text-[11px] font-semibold mr-1" style={{ color: '#9ca3af', letterSpacing: '0.06em' }}>PERÍODO</span>
        {PRESETS.map((p) => <button key={p} onClick={() => setPeriod(p)} className={pillBtn(period === p)}>{p}</button>)}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'UNIDADES VENDIDAS', value: fmtNum(totalUnits) },
          { label: 'FATURAMENTO', value: fmtMoney(totalRev) },
          { label: 'PRODUTOS VENDIDOS', value: fmtNum(perf?.productCount || 0) },
          { label: 'TICKET MÉDIO / UN', value: fmtMoney(ticket) },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginTop: 4 }}>{loadingPerf ? '…' : k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[440px,1fr] gap-4">
        {/* Ranking (best sellers) */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>🏆 Ranking de produtos</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setSortBy('revenue')} className={pillBtn(sortBy === 'revenue')}>Faturamento</button>
              <button onClick={() => setSortBy('units')} className={pillBtn(sortBy === 'units')}>Unidades</button>
            </div>
          </div>
          <input type="text" placeholder="Buscar SKU/nome…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg text-[13px] mb-2" style={{ background: '#fff', border: '1px solid #e5e3de' }} />
          <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left" style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>
                  <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Produto</th>
                  <th className="py-1 pr-2 text-right">Un</th><th className="py-1 text-right">Fat.</th>
                </tr>
              </thead>
              <tbody>
                {loadingPerf && <tr><td colSpan={4} className="py-4 text-center" style={{ color: '#6b7280' }}>Carregando…</td></tr>}
                {!loadingPerf && ranked.map((p, i) => (
                  <tr key={p.motherSku} onClick={() => setSku(p.motherSku)}
                    style={{ cursor: 'pointer', background: p.motherSku === sku ? '#fff0f6' : undefined, borderTop: '1px solid #f0ece4' }}>
                    <td className="py-1.5 pr-2" style={{ color: '#9ca3af' }}>{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <div style={{ fontWeight: p.motherSku === sku ? 700 : 500, color: '#1A1A1A' }} className="truncate max-w-[200px]">{p.name}</div>
                      <div className="font-mono" style={{ fontSize: 10, color: '#9ca3af' }}>{p.motherSku}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-num">{fmtNum(p.units)}</td>
                    <td className="py-1.5 text-right font-num">{fmtMoney(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drill-down do produto selecionado */}
        <div>
          {sel && (
            <div className="mb-3">
              <div className="text-[15px] font-bold" style={{ color: '#1A1A1A' }}>{sel.name}</div>
              <div className="text-[12px]" style={{ color: '#6b7280' }}>
                <span className="font-mono text-[11px]">{sel.motherSku}</span> · {fmtNum(sel.units)} un · {fmtMoney(sel.revenue)} no período
              </div>
            </div>
          )}
          {loadingSeries && <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Carregando série…</div>}
          {!loadingSeries && buckets.filter((b) => b.units > 0).length === 0 && sku && (
            <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Sem vendas deste produto no período.</div>
          )}
          {!loadingSeries && unitPoints.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              <BarLineChart title="UNIDADES VENDIDAS / TEMPO" data={unitPoints} color="#5d4ec5" unit="number" market={market} height={240} />
              <BarLineChart title="FATURAMENTO / TEMPO" data={revPoints} color="#16A34A" unit="currency" market={market} height={240} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

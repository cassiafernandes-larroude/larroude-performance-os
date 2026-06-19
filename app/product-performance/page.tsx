'use client';

// Aba Performance de Produto — Cassia 2026-06-17.
// Seleciona um produto e vê unidades vendidas + faturamento ao longo do tempo,
// em barras (mesmo formato dos outros dashboards: BarLineChart + filtro de período).
// Reusa /api/unit-economics/[market] (lista de produtos) e
// /api/unit-economics/[market]/timeseries (séries por bucket).

import { useEffect, useMemo, useState } from 'react';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import type { Period } from '@/types/metric';

type Market = 'US' | 'BR';
const PRESETS: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

interface ProductRow {
  motherSku: string;
  productName: string;
  totalUnits: number;
}
interface Bucket {
  date: string;
  units: number;
  grossRevenue: number;
  discount: number;
}

export default function ProductPerformancePage() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<Period>('28d');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sku, setSku] = useState<string>('');
  const [search, setSearch] = useState('');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [rangeLabel, setRangeLabel] = useState('');

  // Lista de produtos (catálogo) por market
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    fetch(`/api/unit-economics/${market}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const ps: ProductRow[] = (j.products || [])
          .filter((p: any) => p.motherSku)
          .map((p: any) => ({ motherSku: p.motherSku, productName: p.productName || p.motherSku, totalUnits: Number(p.totalUnits) || 0 }));
        setProducts(ps);
        setSku((prev) => (prev && ps.some((p) => p.motherSku === prev) ? prev : ps[0]?.motherSku || ''));
        setLoadingList(false);
      })
      .catch(() => setLoadingList(false));
    return () => { cancelled = true; };
  }, [market]);

  // Série temporal do produto selecionado
  useEffect(() => {
    if (!sku) { setBuckets([]); return; }
    let cancelled = false;
    setLoadingSeries(true);
    fetch(`/api/unit-economics/${market}/timeseries?sku=${encodeURIComponent(sku)}&period=${period}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { buckets: Bucket[]; start: string; end: string }) => {
        if (cancelled) return;
        setBuckets(j.buckets || []);
        setRangeLabel(j.start && j.end ? `${j.start} → ${j.end}` : '');
        setLoadingSeries(false);
      })
      .catch(() => setLoadingSeries(false));
    return () => { cancelled = true; };
  }, [market, sku, period]);

  const unitPoints: BarPoint[] = useMemo(
    () => buckets.map((b) => ({ date: b.date, value: b.units })),
    [buckets]
  );
  const revPoints: BarPoint[] = useMemo(
    () => buckets.map((b) => ({ date: b.date, value: Math.round((b.grossRevenue - (b.discount || 0)) * 100) / 100 })),
    [buckets]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter((p) => p.motherSku.toLowerCase().includes(q) || p.productName.toLowerCase().includes(q))
      : products;
    return list.slice(0, 300);
  }, [products, search]);

  const sel = products.find((p) => p.motherSku === sku);
  const totalUnits = buckets.reduce((s, b) => s + b.units, 0);
  const totalRev = buckets.reduce((s, b) => s + (b.grossRevenue - (b.discount || 0)), 0);
  const cur = market === 'US' ? '$' : 'R$';
  const pillBtn = (active: boolean) =>
    `pill ${active ? 'pill-active' : 'pill-inactive'} px-3 py-1.5 text-[12px] ${active ? 'font-medium' : ''}`;

  return (
    <main className="main-dashboard-root mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <div className="mb-4">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: '#1A1A1A' }}>Performance de Produto</h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: '#4A4A4A' }}>
          Unidades vendidas e faturamento por produto ao longo do tempo — via BigQuery Larroude OS
        </p>
      </div>

      {/* Filtros: market + período */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => setMarket('US')} className={pillBtn(market === 'US')}>US</button>
        <button onClick={() => setMarket('BR')} className={pillBtn(market === 'BR')}>BR</button>
        <span style={{ width: 1, height: 22, background: '#E5E0D6', margin: '0 4px' }} />
        <span className="text-[11px] font-semibold mr-1" style={{ color: '#9ca3af', letterSpacing: '0.06em' }}>PERÍODO</span>
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={pillBtn(period === p)}>{p}</button>
        ))}
      </div>

      {/* Seletor de produto */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase" style={{ color: '#6b7280', letterSpacing: '0.08em' }}>Produto</span>
          <input
            type="text"
            placeholder="Buscar SKU ou nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[13px]"
            style={{ background: '#fff', border: '1px solid #e5e3de', minWidth: 220 }}
          />
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[13px] flex-1"
            style={{ background: '#fff', border: '1px solid #e5e3de', minWidth: 280, maxWidth: 560 }}
          >
            {loadingList && <option>Carregando produtos…</option>}
            {!loadingList && filtered.length === 0 && <option>Nenhum produto encontrado</option>}
            {filtered.map((p) => (
              <option key={p.motherSku} value={p.motherSku}>
                {p.productName} ({p.motherSku})
              </option>
            ))}
          </select>
          {rangeLabel && <span className="text-[11px] italic" style={{ color: '#9ca3af' }}>{rangeLabel}</span>}
        </div>
        {sel && (
          <div className="text-[12px] mt-3" style={{ color: '#4A4A4A' }}>
            <strong>{sel.productName}</strong> · <span className="font-mono text-[11px]">{sel.motherSku}</span>
            {' · '}{totalUnits.toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')} un no período
            {' · '}{cur}{Math.round(totalRev).toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')} faturamento
          </div>
        )}
      </div>

      {loadingSeries && (
        <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Carregando série…</div>
      )}
      {!loadingSeries && buckets.length === 0 && sku && (
        <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>
          Sem vendas deste produto no período selecionado.
        </div>
      )}
      {!loadingSeries && buckets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BarLineChart
            title="UNIDADES VENDIDAS"
            data={unitPoints}
            color="#5d4ec5"
            unit="number"
            market={market}
            height={260}
          />
          <BarLineChart
            title="FATURAMENTO"
            data={revPoints}
            color="#16A34A"
            unit="currency"
            market={market}
            height={260}
          />
        </div>
      )}
    </main>
  );
}

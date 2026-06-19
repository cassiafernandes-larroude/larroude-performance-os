'use client';

// Aba Performance de Produto (robusta) — Cassia 2026-06-17 / multi-seleção + hoje 2026-06-19.
// Topo: KPIs AO VIVO DE HOJE da seleção (unidades, faturamento, ROAS — ROAS via ads por SKU).
// Filtro de período: presets + calendário (range custom). Ranking best-sellers multi-select
// (quantos produtos quiser) alimenta o drill-down agregado (unidades + faturamento no tempo).
// Fontes: /api/product-performance/[market] (ranking) + /today (live) + /api/unit-economics/[market]/timeseries.

import { useEffect, useMemo, useState } from 'react';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import type { Period } from '@/types/metric';

type Market = 'US' | 'BR';
const PRESETS: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

interface ProductRow { motherSku: string; name: string; category: string; units: number; revenue: number; }
interface Bucket { date: string; units: number; grossRevenue: number; discount: number; }
interface TodayData {
  date: string;
  metaOk: boolean;
  salesBySku: Record<string, { units: number; orders: number; revenue: number }>;
  adSpendBySku: Record<string, { spend: number; purchaseValue: number }>;
  generatedAt: string;
}

// Casa um SKU de anúncio (pode ser genérico "L420" ou completo) com um mother SKU, por prefixo.
function adKeysForMother(motherSku: string, adSpendBySku: Record<string, unknown>): string[] {
  return Object.keys(adSpendBySku).filter(
    (a) => a === motherSku || motherSku.startsWith(a + '-') || a.startsWith(motherSku + '-')
  );
}

export default function ProductPerformancePage() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<Period>('28d');
  const [useCustom, setUseCustom] = useState(false);
  const [cStart, setCStart] = useState('');
  const [cEnd, setCEnd] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'units'>('revenue');
  const [search, setSearch] = useState('');
  const [perf, setPerf] = useState<{ totalUnits: number; totalRevenue: number; productCount: number; products: ProductRow[]; start?: string; end?: string } | null>(null);
  const [loadingPerf, setLoadingPerf] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [today, setToday] = useState<TodayData | null>(null);
  const [seriesBySku, setSeriesBySku] = useState<Record<string, Bucket[]>>({});
  const [loadingSeries, setLoadingSeries] = useState(false);

  const cur = market === 'US' ? '$' : 'R$';
  const loc = market === 'US' ? 'en-US' : 'pt-BR';
  const fmtMoney = (v: number) => `${cur}${Math.round(v).toLocaleString(loc)}`;
  const fmtNum = (v: number) => v.toLocaleString(loc);

  // Range custom válido (ambas as datas) tem precedência sobre o preset.
  const customValid = useCustom && /^\d{4}-\d{2}-\d{2}$/.test(cStart) && /^\d{4}-\d{2}-\d{2}$/.test(cEnd) && cStart <= cEnd;
  const rangeQS = customValid ? `start=${cStart}&end=${cEnd}` : `period=${period}`;

  // Ranking + totais do período
  useEffect(() => {
    let cancelled = false;
    setLoadingPerf(true);
    fetch(`/api/product-performance/${market}?${rangeQS}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setPerf(j);
        const top = (j.products || [])[0]?.motherSku;
        setSelected((prev) => (prev.size > 0 ? prev : top ? new Set([top]) : new Set()));
        setLoadingPerf(false);
      })
      .catch(() => setLoadingPerf(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, rangeQS]);

  // Live de hoje (vendas + spend por SKU) — só depende do market
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/product-performance/${market}/today`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && !j.error) setToday(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [market]);

  // Séries temporais dos produtos selecionados (drill-down agregado)
  useEffect(() => {
    const skus = Array.from(selected);
    if (skus.length === 0) { setSeriesBySku({}); return; }
    let cancelled = false;
    setLoadingSeries(true);
    Promise.all(
      skus.map((sku) =>
        fetch(`/api/unit-economics/${market}/timeseries?sku=${encodeURIComponent(sku)}&${rangeQS}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((j: { buckets: Bucket[] }) => [sku, j.buckets || []] as const)
          .catch(() => [sku, [] as Bucket[]] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      setSeriesBySku(Object.fromEntries(entries));
      setLoadingSeries(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, rangeQS, Array.from(selected).sort().join(',')]);

  const products = perf?.products || [];
  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...products]
      .filter((p) => !q || p.motherSku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .sort((a, b) => (sortBy === 'units' ? b.units - a.units : b.revenue - a.revenue))
      .slice(0, 60);
  }, [products, search, sortBy]);

  // Drill-down agregado: soma as séries dos SKUs selecionados por data
  const { unitPoints, revPoints } = useMemo(() => {
    const acc = new Map<string, { units: number; rev: number }>();
    for (const sku of Object.keys(seriesBySku)) {
      if (!selected.has(sku)) continue;
      for (const b of seriesBySku[sku]) {
        if (b.units <= 0) continue;
        const e = acc.get(b.date) || { units: 0, rev: 0 };
        e.units += b.units;
        e.rev += Math.round((b.grossRevenue - (b.discount || 0)) * 100) / 100;
        acc.set(b.date, e);
      }
    }
    const dates = Array.from(acc.keys()).sort();
    return {
      unitPoints: dates.map((d) => ({ date: d, value: acc.get(d)!.units })) as BarPoint[],
      revPoints: dates.map((d) => ({ date: d, value: Math.round(acc.get(d)!.rev * 100) / 100 })) as BarPoint[],
    };
  }, [seriesBySku, selected]);

  // KPIs do período (seleção)
  const selRows = products.filter((p) => selected.has(p.motherSku));
  const selUnits = selRows.reduce((s, p) => s + p.units, 0);
  const selRevenue = selRows.reduce((s, p) => s + p.revenue, 0);

  // KPIs AO VIVO DE HOJE (seleção)
  const liveToday = useMemo(() => {
    if (!today) return null;
    const skus = Array.from(selected);
    let units = 0, revenue = 0;
    const adKeys = new Set<string>();
    for (const sku of skus) {
      const s = today.salesBySku[sku];
      if (s) { units += s.units; revenue += s.revenue; }
      for (const k of adKeysForMother(sku, today.adSpendBySku)) adKeys.add(k);
    }
    let spend = 0, pv = 0;
    for (const k of adKeys) { const a = today.adSpendBySku[k]; if (a) { spend += a.spend; pv += a.purchaseValue; } }
    // ROAS do anúncio = valor de compra atribuído pelo Meta / spend (os ads são por SKU).
    return { units, revenue, spend, hasAds: adKeys.size > 0, roas: spend > 0 ? pv / spend : null, attrValue: pv };
  }, [today, selected]);

  const toggle = (sku: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(sku)) n.delete(sku); else n.add(sku);
    return n;
  });
  const selectOnly = (sku: string) => setSelected(new Set([sku]));

  const pillBtn = (active: boolean) => `pill ${active ? 'pill-active' : 'pill-inactive'} px-3 py-1.5 text-[12px] ${active ? 'font-medium' : ''}`;
  const selCount = selected.size;

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
        {PRESETS.map((p) => (
          <button key={p} onClick={() => { setPeriod(p); setUseCustom(false); }} className={pillBtn(!useCustom && period === p)}>{p}</button>
        ))}
        <button onClick={() => setUseCustom((v) => !v)} className={pillBtn(useCustom)} title="Selecionar intervalo de datas">📅 Personalizado</button>
        {useCustom && (
          <span className="flex items-center gap-1">
            <input type="date" value={cStart} max={cEnd || undefined} onChange={(e) => setCStart(e.target.value)}
              className="px-2 py-1 rounded-lg text-[12px]" style={{ background: '#fff', border: '1px solid #e5e3de' }} />
            <span style={{ color: '#9ca3af' }}>→</span>
            <input type="date" value={cEnd} min={cStart || undefined} onChange={(e) => setCEnd(e.target.value)}
              className="px-2 py-1 rounded-lg text-[12px]" style={{ background: '#fff', border: '1px solid #e5e3de' }} />
          </span>
        )}
      </div>

      {/* KPIs DA SELEÇÃO (todos referentes aos produtos selecionados) */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#16A34A' }}>● Ao vivo · hoje {today?.date ? `(${today.date})` : ''}</span>
        <span className="text-[11px] font-semibold" style={{ color: '#1A1A1A' }}>
          {selCount === 0 ? 'nenhum produto selecionado' : selCount === 1 ? selRows[0]?.name : `${selCount} produtos selecionados`}
        </span>
        <span className="text-[11px]" style={{ color: '#9ca3af' }}>
          · mercado: {today ? fmtNum(today.totalUnits) : '…'} un hoje · {fmtNum(perf?.totalUnits || 0)} un no período
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { live: true, label: 'UNIDADES HOJE', value: liveToday ? fmtNum(liveToday.units) : '…', sub: 'seleção · hoje' },
          { live: true, label: 'FATURAMENTO HOJE', value: liveToday ? fmtMoney(liveToday.revenue) : '…', sub: 'seleção · hoje' },
          {
            live: true,
            label: 'ROAS HOJE',
            value: !liveToday ? '…' : liveToday.roas != null ? `${liveToday.roas.toFixed(2)}x` : liveToday.hasAds ? '0.00x' : '— sem ads',
            sub: liveToday && liveToday.hasAds ? `spend ${fmtMoney(liveToday.spend)} · ads Meta` : 'sem SKU anunciado',
          },
          { live: false, label: 'UNIDADES NO PERÍODO', value: loadingPerf ? '…' : fmtNum(selUnits), sub: 'seleção' },
          { live: false, label: 'FATURAMENTO NO PERÍODO', value: loadingPerf ? '…' : fmtMoney(selRevenue), sub: 'seleção' },
        ].map((k) => (
          <div key={k.label} className="card p-4" style={k.live ? { borderLeft: '3px solid #16A34A' } : undefined}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: '#6b7280' }}>{k.label}</div>
            <div style={{ fontSize: 23, fontWeight: 700, color: '#111827', marginTop: 4 }}>{k.value}</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      {today && !today.metaOk && (
        <div className="mb-4 text-[11px] px-3 py-2 rounded-lg" style={{ background: '#fffbe6', color: '#92732a', border: '1px solid #f0e3b0' }}>
          ⚠️ Spend Meta de hoje pode estar incompleto (falha parcial na API) — ROAS é aproximado.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[460px,1fr] gap-4">
        {/* Ranking (best sellers) — multi-select */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>🏆 Ranking · selecione quantos quiser</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setSortBy('revenue')} className={pillBtn(sortBy === 'revenue')}>Fat.</button>
              <button onClick={() => setSortBy('units')} className={pillBtn(sortBy === 'units')}>Un.</button>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input type="text" placeholder="Buscar SKU/nome…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #e5e3de' }} />
            {selCount > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-[11px] underline" style={{ color: '#9ca3af' }}>limpar ({selCount})</button>
            )}
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 560 }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left" style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>
                  <th className="py-1 pr-1"></th><th className="py-1 pr-2">#</th><th className="py-1 pr-2">Produto</th>
                  <th className="py-1 pr-2 text-right">Un</th><th className="py-1 text-right">Fat.</th>
                </tr>
              </thead>
              <tbody>
                {loadingPerf && <tr><td colSpan={5} className="py-4 text-center" style={{ color: '#6b7280' }}>Carregando…</td></tr>}
                {!loadingPerf && ranked.map((p, i) => {
                  const isSel = selected.has(p.motherSku);
                  const hasAds = today ? adKeysForMother(p.motherSku, today.adSpendBySku).length > 0 : false;
                  return (
                    <tr key={p.motherSku} onClick={() => toggle(p.motherSku)}
                      style={{ cursor: 'pointer', background: isSel ? '#fff0f6' : undefined, borderTop: '1px solid #f0ece4' }}>
                      <td className="py-1.5 pr-1"><input type="checkbox" checked={isSel} readOnly style={{ accentColor: '#d6336c' }} /></td>
                      <td className="py-1.5 pr-2" style={{ color: '#9ca3af' }}>{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <div style={{ fontWeight: isSel ? 700 : 500, color: '#1A1A1A' }} className="truncate max-w-[210px]">
                          {p.name} {hasAds && <span title="Tem anúncio ativo hoje">📣</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ fontSize: 10, color: '#9ca3af' }}>{p.motherSku}</span>
                          <button onClick={(e) => { e.stopPropagation(); selectOnly(p.motherSku); }} className="text-[9px] underline" style={{ color: '#c7c2b6' }}>só este</button>
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right font-num">{fmtNum(p.units)}</td>
                      <td className="py-1.5 text-right font-num">{fmtMoney(p.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drill-down agregado da seleção */}
        <div>
          <div className="mb-3">
            <div className="text-[15px] font-bold" style={{ color: '#1A1A1A' }}>
              {selCount === 0 ? 'Nenhum produto selecionado' : selCount === 1 ? selRows[0]?.name : `${selCount} produtos selecionados`}
            </div>
            <div className="text-[12px]" style={{ color: '#6b7280' }}>
              {selCount > 0 && <>{fmtNum(selUnits)} un · {fmtMoney(selRevenue)} no período</>}
            </div>
          </div>
          {selCount === 0 && <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Marque um ou mais produtos no ranking para ver a evolução.</div>}
          {selCount > 0 && loadingSeries && <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Carregando série…</div>}
          {selCount > 0 && !loadingSeries && unitPoints.length === 0 && (
            <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Sem vendas da seleção no período.</div>
          )}
          {selCount > 0 && !loadingSeries && unitPoints.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              <BarLineChart title={`UNIDADES VENDIDAS / TEMPO${selCount > 1 ? ' (soma da seleção)' : ''}`} data={unitPoints} color="#5d4ec5" unit="number" market={market} height={240} />
              <BarLineChart title={`FATURAMENTO / TEMPO${selCount > 1 ? ' (soma da seleção)' : ''}`} data={revPoints} color="#16A34A" unit="currency" market={market} height={240} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

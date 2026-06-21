'use client';

// Aba Performance de Produto (robusta) — Cassia 2026-06-19.
// Cards de best-sellers com IMAGEM do produto (rank, unidades/faturamento, preço médio,
// Δ vs período anterior, % do total), multi-seleção, KPIs ao vivo de hoje da seleção,
// filtro de período igual ao Dashboard Principal e visão CONSOLIDADA (BR+US em US$).
// Fontes: /api/product-performance/[market|all] (+/today) + /api/unit-economics/[market]/timeseries.

import { useEffect, useMemo, useRef, useState } from 'react';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import { FULFILLMENT_CATEGORY_GROUPS, type FulfillmentCategory } from '@/lib/shared/fulfillment-category';

type MarketSel = 'US' | 'BR' | 'ALL';
type RealMarket = 'US' | 'BR';
type PeriodKey = '1d' | '7d' | '14d' | '28d' | '3M' | '6M' | '12M';
const PRESETS: PeriodKey[] = ['1d', '7d', '14d', '28d', '3M', '6M', '12M'];

const PILL_BASE = 'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const PILL_ACTIVE_DARK = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-5 py-1.5 sm:py-2`;

function periodLabel(p: PeriodKey): string { return p === '1d' ? 'D-1' : p.toUpperCase(); }
function ptPeriodLabel(p: PeriodKey): string {
  switch (p) {
    case '1d': return 'Ontem';
    case '7d': return 'Últimos 7 dias';
    case '14d': return 'Últimos 14 dias';
    case '28d': return 'Últimos 28 dias';
    case '3M': return 'Últimos 3 meses';
    case '6M': return 'Últimos 6 meses';
    case '12M': return 'Últimos 12 meses';
  }
}
function yesterdayInMarket(market: RealMarket): string {
  const tz = market === 'US' ? 'America/New_York' : 'America/Sao_Paulo';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function daysInclusive(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
}

type ProductGroup = 'tenis' | 'bolsas' | 'vestuario' | 'calcados' | 'outros';
interface ProductRow {
  motherSku: string; name: string; image: string | null; category: string;
  units: number; revenue: number; prevUnits: number; prevRevenue: number;
  group: ProductGroup; isB2B: boolean; isCollab: boolean; isNew: boolean;
  materials: string[]; colors: string[];
}
type CatKey = 'all' | 'novos' | 'collab' | 'b2b' | 'tenis' | 'bolsas' | 'vestuario' | 'material';
const CAT_TABS: { key: CatKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'novos', label: 'Lançamentos' },
  { key: 'collab', label: 'Collabs' },
  { key: 'b2b', label: 'B2B' },
  { key: 'tenis', label: 'Tênis' },
  { key: 'bolsas', label: 'Bolsas/Acessórios' },
  { key: 'vestuario', label: 'Vestuário' },
  { key: 'material', label: 'Material/Cor' },
];
interface RawBucket { date: string; units: number; grossRevenue: number; discount: number; }
interface SeriesPoint { date: string; units: number; revenue: number; }
interface TodayData {
  date: string; metaOk: boolean; totalUnits: number; totalRevenue: number; fx: number;
  salesBySku: Record<string, { units: number; orders: number; revenue: number }>;
  adSpendBySku: Record<string, { spend: number; purchaseValue: number }>;
}
interface PerfResp {
  currency: 'USD' | 'BRL'; fx: number | null; totalUnits: number; totalRevenue: number;
  productCount: number; products: ProductRow[]; start?: string; end?: string;
}

function adKeysForMother(motherSku: string, adSpendBySku: Record<string, unknown>): string[] {
  return Object.keys(adSpendBySku).filter(
    (a) => a === motherSku || motherSku.startsWith(a + '-') || a.startsWith(motherSku + '-')
  );
}
function normSeries(buckets: RawBucket[], toUsd: number): SeriesPoint[] {
  return buckets.filter((b) => b.units > 0).map((b) => ({ date: b.date, units: b.units, revenue: (b.grossRevenue - (b.discount || 0)) * toUsd }));
}
function mergeSeries(a: SeriesPoint[], b: SeriesPoint[]): SeriesPoint[] {
  const m = new Map<string, SeriesPoint>();
  for (const p of [...a, ...b]) {
    const e = m.get(p.date) || { date: p.date, units: 0, revenue: 0 };
    e.units += p.units; e.revenue += p.revenue; m.set(p.date, e);
  }
  return Array.from(m.values()).sort((x, y) => x.date.localeCompare(y.date));
}

export default function ProductPerformancePage() {
  const [market, setMarket] = useState<MarketSel>('US');
  const [period, setPeriod] = useState<PeriodKey>('28d');
  const [isCustom, setIsCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'units'>('revenue');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [cat, setCat] = useState<CatKey>('all');
  const [matSel, setMatSel] = useState<string | null>(null);
  const [colorSel, setColorSel] = useState<string | null>(null);
  const [fulCats, setFulCats] = useState<FulfillmentCategory[]>([]); // origem: vazio = todas
  const [perf, setPerf] = useState<PerfResp | null>(null);
  const [loadingPerf, setLoadingPerf] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [today, setToday] = useState<TodayData | null>(null);
  const [seriesBySku, setSeriesBySku] = useState<Record<string, SeriesPoint[]>>({});
  const [loadingSeries, setLoadingSeries] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollCarousel = (dir: -1 | 1) => carouselRef.current?.scrollBy({ left: dir * 640, behavior: 'smooth' });

  const currency = perf?.currency || (market === 'BR' ? 'BRL' : 'USD');
  const cur = currency === 'BRL' ? 'R$' : '$';
  const loc = currency === 'BRL' ? 'pt-BR' : 'en-US';
  const fmtMoney = (v: number) => `${cur}${Math.round(v).toLocaleString(loc)}`;
  const fmtNum = (v: number) => Math.round(v).toLocaleString(loc);

  const rangeQS = isCustom
    ? `start=${customStart}&end=${customEnd}`
    : period === '1d'
      ? (() => { const y = yesterdayInMarket(market === 'BR' ? 'BR' : 'US'); return `start=${y}&end=${y}`; })()
      : `period=${period}`;
  const originQS = fulCats.length ? `&fulCats=${fulCats.join(',')}` : '';

  function handlePeriodChange(p: PeriodKey) { setIsCustom(false); setPeriod(p); }
  function applyDates() {
    if (!draftStart || !draftEnd) { alert('Selecione data inicial e final.'); return; }
    if (draftStart > draftEnd) { alert('Data inicial deve ser anterior ou igual à data final.'); return; }
    setCustomStart(draftStart); setCustomEnd(draftEnd); setIsCustom(true);
  }
  const activeLabel = isCustom
    ? `Últimos ${daysInclusive(customStart, customEnd)} dia${daysInclusive(customStart, customEnd) === 1 ? '' : 's'}`
    : ptPeriodLabel(period);

  // Ranking (com imagem + período anterior). market=ALL → rota consolida BR+US em US$.
  useEffect(() => {
    let cancelled = false;
    setLoadingPerf(true);
    fetch(`/api/product-performance/${market}?${rangeQS}${originQS}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: PerfResp & { error?: string }) => {
        if (cancelled || j.error) { setLoadingPerf(false); return; }
        setPerf(j);
        const top = (j.products || [])[0]?.motherSku;
        setSelected((prev) => (prev.size > 0 ? prev : top ? new Set([top]) : new Set()));
        setLoadingPerf(false);
      })
      .catch(() => setLoadingPerf(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, rangeQS, originQS]);

  useEffect(() => {
    if (!isCustom && perf?.start && perf?.end) { setDraftStart(perf.start); setDraftEnd(perf.end); }
  }, [perf?.start, perf?.end, isCustom]);

  // Live de hoje. Consolidado: busca US+BR e mescla em US$ (BR ÷ FX).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (market !== 'ALL') {
        const j = await fetch(`/api/product-performance/${market}/today`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
        if (!cancelled && j && !j.error) setToday(j);
        return;
      }
      const [us, br] = await Promise.all([
        fetch('/api/product-performance/US/today', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/product-performance/BR/today', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      if (cancelled || !us || !br || us.error || br.error) return;
      const fx = br.fx || 5.45;
      const salesBySku: TodayData['salesBySku'] = {};
      for (const [k, v] of Object.entries(us.salesBySku as TodayData['salesBySku'])) salesBySku[k] = { units: v.units, orders: v.orders, revenue: v.revenue };
      for (const [k, v] of Object.entries(br.salesBySku as TodayData['salesBySku'])) {
        const e = salesBySku[k] || { units: 0, orders: 0, revenue: 0 };
        e.units += v.units; e.orders += v.orders; e.revenue += v.revenue / fx; salesBySku[k] = e;
      }
      const adSpendBySku: TodayData['adSpendBySku'] = {};
      for (const [k, v] of Object.entries(us.adSpendBySku as TodayData['adSpendBySku'])) adSpendBySku[k] = { spend: v.spend, purchaseValue: v.purchaseValue };
      for (const [k, v] of Object.entries(br.adSpendBySku as TodayData['adSpendBySku'])) {
        const e = adSpendBySku[k] || { spend: 0, purchaseValue: 0 };
        e.spend += v.spend / fx; e.purchaseValue += v.purchaseValue / fx; adSpendBySku[k] = e;
      }
      if (!cancelled) setToday({
        date: us.date, metaOk: us.metaOk && br.metaOk, fx: 1,
        totalUnits: us.totalUnits + br.totalUnits, totalRevenue: us.totalRevenue + br.totalRevenue / fx,
        salesBySku, adSpendBySku,
      });
    }
    load();
    return () => { cancelled = true; };
  }, [market]);

  // Séries do drill-down. Consolidado: US + BR (BR ÷ FX) por SKU, mescladas por data.
  const selKey = Array.from(selected).sort().join(',');
  useEffect(() => {
    const skus = Array.from(selected);
    if (skus.length === 0) { setSeriesBySku({}); return; }
    let cancelled = false;
    setLoadingSeries(true);
    const fx = perf?.fx || 5.45;
    const fetchTs = (mk: RealMarket, sku: string) =>
      fetch(`/api/unit-economics/${mk}/timeseries?sku=${encodeURIComponent(sku)}&${rangeQS}${originQS}`, { cache: 'no-store' })
        .then((r) => r.json()).then((j: { buckets: RawBucket[] }) => j.buckets || []).catch(() => [] as RawBucket[]);
    const one = async (sku: string): Promise<readonly [string, SeriesPoint[]]> => {
      if (market !== 'ALL') return [sku, normSeries(await fetchTs(market, sku), 1)] as const;
      const [u, b] = await Promise.all([fetchTs('US', sku), fetchTs('BR', sku)]);
      return [sku, mergeSeries(normSeries(u, 1), normSeries(b, 1 / fx))] as const;
    };
    Promise.all(skus.map(one)).then((entries) => {
      if (cancelled) return;
      setSeriesBySku(Object.fromEntries(entries));
      setLoadingSeries(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, rangeQS, originQS, selKey, perf?.fx]);

  const products = perf?.products || [];
  // Lista COMPLETA (todos os produtos do período) filtrada+ordenada — sem corte.
  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...products]
      .filter((p) => !q || p.motherSku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .sort((a, b) => (sortBy === 'units' ? b.units - a.units : b.revenue - a.revenue));
  }, [products, search, sortBy]);
  // Filtro de categoria (abas do carrossel). Tabela acima continua mostrando tudo.
  function matchesCat(p: ProductRow): boolean {
    switch (cat) {
      case 'novos': return p.isNew;
      case 'collab': return p.isCollab;
      case 'b2b': return p.isB2B;
      case 'tenis': return p.group === 'tenis';
      case 'bolsas': return p.group === 'bolsas';
      case 'vestuario': return p.group === 'vestuario';
      case 'material':
        if (matSel && !p.materials.includes(matSel)) return false;
        if (colorSel && !p.colors.includes(colorSel)) return false;
        return true;
      default: return true;
    }
  }
  const catFiltered = useMemo(() => ranked.filter(matchesCat), [ranked, cat, matSel, colorSel]);
  // Materiais/cores disponíveis (pra aba Material/Cor), do conjunto do período.
  const { materials, colors } = useMemo(() => {
    const ms = new Set<string>(); const cs = new Set<string>();
    for (const p of products) { p.materials.forEach((m) => ms.add(m)); p.colors.forEach((c) => cs.add(c)); }
    return { materials: Array.from(ms).sort(), colors: Array.from(cs).sort() };
  }, [products]);
  const catCount = (k: CatKey): number => {
    if (k === 'all') return ranked.length;
    if (k === 'material') return ranked.length;
    return ranked.filter((p) => k === 'novos' ? p.isNew : k === 'collab' ? p.isCollab : k === 'b2b' ? p.isB2B : p.group === k).length;
  };
  // Render incremental pra não pesar: mostra INITIAL_CARDS e expande sob demanda.
  const INITIAL_CARDS = 60;
  const visible = (showAll || search.trim()) ? catFiltered : catFiltered.slice(0, INITIAL_CARDS);

  const { unitPoints, revPoints } = useMemo(() => {
    const acc = new Map<string, { units: number; rev: number }>();
    for (const sku of Object.keys(seriesBySku)) {
      if (!selected.has(sku)) continue;
      for (const p of seriesBySku[sku]) {
        const e = acc.get(p.date) || { units: 0, rev: 0 };
        e.units += p.units; e.rev += p.revenue; acc.set(p.date, e);
      }
    }
    const dates = Array.from(acc.keys()).sort();
    return {
      unitPoints: dates.map((d) => ({ date: d, value: acc.get(d)!.units })) as BarPoint[],
      revPoints: dates.map((d) => ({ date: d, value: Math.round(acc.get(d)!.rev * 100) / 100 })) as BarPoint[],
    };
  }, [seriesBySku, selected]);

  const selRows = products.filter((p) => selected.has(p.motherSku));
  const selUnits = selRows.reduce((s, p) => s + p.units, 0);
  const selRevenue = selRows.reduce((s, p) => s + p.revenue, 0);

  const liveToday = useMemo(() => {
    if (!today) return null;
    let units = 0, revenue = 0;
    const adKeys = new Set<string>();
    for (const sku of selected) {
      const s = today.salesBySku[sku];
      if (s) { units += s.units; revenue += s.revenue; }
      for (const k of adKeysForMother(sku, today.adSpendBySku)) adKeys.add(k);
    }
    let spend = 0, pv = 0;
    for (const k of adKeys) { const a = today.adSpendBySku[k]; if (a) { spend += a.spend; pv += a.purchaseValue; } }
    return { units, revenue, spend, hasAds: adKeys.size > 0, roas: spend > 0 ? pv / spend : null };
  }, [today, selected]);

  const toggle = (sku: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(sku)) n.delete(sku); else n.add(sku);
    return n;
  });
  const pillBtn = (active: boolean) => `pill ${active ? 'pill-active' : 'pill-inactive'} px-3 py-1.5 text-[12px] ${active ? 'font-medium' : ''}`;
  const toggleFulGroup = (cats: FulfillmentCategory[]) => setFulCats((prev) => {
    const set = new Set(prev);
    if (cats.every((c) => set.has(c))) cats.forEach((c) => set.delete(c));
    else cats.forEach((c) => set.add(c));
    return [...set];
  });
  const selCount = selected.size;
  const totalMetric = sortBy === 'units' ? (perf?.totalUnits || 0) : (perf?.totalRevenue || 0);

  return (
    <main className="main-dashboard-root mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <div className="mb-4">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: '#1A1A1A' }}>Performance de Produto</h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: '#4A4A4A' }}>
          Best sellers com imagem, ranking e evolução por produto — via BigQuery Larroude OS
          {market === 'ALL' && <> · <span style={{ color: '#7c3aed', fontWeight: 600 }}>consolidado BR+US em US$</span></>}
        </p>
      </div>

      {/* Market — inclui Consolidado (BR+US) */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => setMarket('US')} className={pillBtn(market === 'US')}>US</button>
        <button onClick={() => setMarket('BR')} className={pillBtn(market === 'BR')}>BR</button>
        <button onClick={() => setMarket('ALL')} className={pillBtn(market === 'ALL')}>🌎 Consolidado (BR+US)</button>
      </div>

      {/* Filtro de período — idêntico ao Dashboard Principal */}
      <div className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 mb-6" style={{ background: 'white', border: '0.8px solid #e5e3de' }}>
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1" style={{ color: '#9ca3af' }}>PERÍODO</span>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map((p) => {
            const active = period === p && !isCustom;
            return (
              <button key={p} onClick={() => handlePeriodChange(p)} className={active ? PILL_ACTIVE_DARK : PILL_INACTIVE}>{periodLabel(p)}</button>
            );
          })}
        </div>
        <div className="h-7 w-px mx-1" style={{ background: '#e5e3de' }} />
        <input type="date" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
          className="rounded-full px-4 py-2 text-[13px] bg-white font-medium" style={{ border: `1px solid ${isCustom ? '#ec4899' : '#e5e3de'}`, boxShadow: isCustom ? '0 0 0 1px rgba(236,72,153,0.30)' : 'none' }} />
        <span className="text-[13px]" style={{ color: '#6b7280' }}>até</span>
        <input type="date" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
          className="rounded-full px-4 py-2 text-[13px] bg-white font-medium" style={{ border: `1px solid ${isCustom ? '#ec4899' : '#e5e3de'}`, boxShadow: isCustom ? '0 0 0 1px rgba(236,72,153,0.30)' : 'none' }} />
        <button onClick={applyDates} className={PILL_ACTIVE_DARK} title="Aplicar intervalo">Aplicar</button>
        <span className="ml-auto text-[13px] italic px-2" style={{ color: '#9ca3af' }}>{activeLabel}</span>
      </div>
      {/* Mais vendidos — cards com imagem (logo abaixo do filtro de período) */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>🏆 Mais vendidos · com imagem (clique pra selecionar)</span>
        <div className="flex items-center rounded-full overflow-hidden" style={{ border: '1px solid #e5e3de' }}>
          <button onClick={() => setSortBy('units')} className="px-3 py-1.5 text-[12px] font-semibold" style={{ background: sortBy === 'units' ? '#1a1a1a' : '#fff', color: sortBy === 'units' ? '#fff' : '#1a1a1a' }}>Qtd</button>
          <button onClick={() => setSortBy('revenue')} className="px-3 py-1.5 text-[12px] font-semibold" style={{ background: sortBy === 'revenue' ? '#1a1a1a' : '#fff', color: sortBy === 'revenue' ? '#fff' : '#1a1a1a' }}>Receita</button>
        </div>
      </div>

      {/* Abas de categoria do carrossel */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {CAT_TABS.map((tabItem) => {
          const active = cat === tabItem.key;
          return (
            <button key={tabItem.key} onClick={() => { setCat(tabItem.key); if (tabItem.key !== 'material') { setMatSel(null); setColorSel(null); } }}
              className={active ? PILL_ACTIVE_DARK : PILL_INACTIVE} style={{ fontSize: 12 }}>
              {tabItem.label}{tabItem.key !== 'material' && <span style={{ opacity: 0.6, marginLeft: 6 }}>{catCount(tabItem.key)}</span>}
            </button>
          );
        })}
      </div>

      {/* Sub-chips de material/cor */}
      {cat === 'material' && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase mr-1" style={{ color: '#9ca3af' }}>Material</span>
            <button onClick={() => setMatSel(null)} className="px-2.5 py-1 rounded-full text-[11px]" style={{ background: !matSel ? '#1a1a1a' : '#ebe9e3', color: !matSel ? '#fff' : '#1a1a1a' }}>Todos</button>
            {materials.map((mt) => (
              <button key={mt} onClick={() => setMatSel(matSel === mt ? null : mt)} className="px-2.5 py-1 rounded-full text-[11px]" style={{ background: matSel === mt ? '#1a1a1a' : '#ebe9e3', color: matSel === mt ? '#fff' : '#1a1a1a' }}>{mt}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase mr-1" style={{ color: '#9ca3af' }}>Cor</span>
            <button onClick={() => setColorSel(null)} className="px-2.5 py-1 rounded-full text-[11px]" style={{ background: !colorSel ? '#1a1a1a' : '#ebe9e3', color: !colorSel ? '#fff' : '#1a1a1a' }}>Todas</button>
            {colors.map((cl) => (
              <button key={cl} onClick={() => setColorSel(colorSel === cl ? null : cl)} className="px-2.5 py-1 rounded-full text-[11px]" style={{ background: colorSel === cl ? '#1a1a1a' : '#ebe9e3', color: colorSel === cl ? '#fff' : '#1a1a1a' }}>{cl}</button>
            ))}
          </div>
        </div>
      )}

      {loadingPerf && <div className="card p-8 text-center text-sm mb-6" style={{ color: '#6b7280' }}>Carregando…</div>}
      {!loadingPerf && (
        <div className="relative mb-4">
          <button onClick={() => scrollCarousel(-1)} aria-label="Anterior"
            className="hidden sm:flex absolute left-[-6px] top-[90px] z-20 items-center justify-center"
            style={{ width: 38, height: 38, borderRadius: '50%', background: '#fff', border: '1px solid #e5e3de', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', cursor: 'pointer', fontSize: 20, color: '#1a1a1a' }}>‹</button>
          <button onClick={() => scrollCarousel(1)} aria-label="Próximo"
            className="hidden sm:flex absolute right-[-6px] top-[90px] z-20 items-center justify-center"
            style={{ width: 38, height: 38, borderRadius: '50%', background: '#fff', border: '1px solid #e5e3de', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', cursor: 'pointer', fontSize: 20, color: '#1a1a1a' }}>›</button>
          <div ref={carouselRef} className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x proximity', scrollbarWidth: 'thin' }}>
          {visible.map((p, i) => {
            const isSel = selected.has(p.motherSku);
            const hasAds = today ? adKeysForMother(p.motherSku, today.adSpendBySku).length > 0 : false;
            const metric = sortBy === 'units' ? p.units : p.revenue;
            const prevMetric = sortBy === 'units' ? p.prevUnits : p.prevRevenue;
            const up = metric >= prevMetric;
            const deltaPct = prevMetric > 0 ? Math.min(999, Math.round(Math.abs(metric - prevMetric) / prevMetric * 100)) : (metric > 0 ? 100 : 0);
            const shareTotal = totalMetric > 0 ? (metric / totalMetric * 100) : 0;
            const avgPrice = p.units > 0 ? p.revenue / p.units : 0;
            const rank = i + 1;
            const gold = rank <= 3;
            return (
              <div key={p.motherSku} onClick={() => toggle(p.motherSku)}
                className="relative rounded-2xl overflow-hidden cursor-pointer transition-all"
                style={{ flex: '0 0 auto', width: 188, scrollSnapAlign: 'start', background: '#fff', border: isSel ? '2px solid #ec4899' : '1px solid #ece9e2', boxShadow: isSel ? '0 0 0 2px rgba(236,72,153,0.18)' : '0 1px 2px rgba(0,0,0,0.03)' }}>
                <div className="absolute top-2 left-2 z-10 flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: '50%', fontSize: 12, fontWeight: 700, color: '#fff', background: gold ? '#b89b3e' : '#9ca3af' }}>{rank}</div>
                {isSel && <div className="absolute top-2 right-2 z-10" style={{ width: 22, height: 22, borderRadius: '50%', background: '#ec4899', color: '#fff', fontSize: 13, lineHeight: '22px', textAlign: 'center', fontWeight: 700 }}>✓</div>}
                <div style={{ aspectRatio: '1 / 1', background: '#f6f4ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.image
                    ? <img src={p.image} alt={p.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 34 }}>👠</span>}
                </div>
                <div className="p-3">
                  <div className="font-semibold leading-tight" style={{ fontSize: 12.5, color: '#1A1A1A', minHeight: 32, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.name} {hasAds && <span title="Tem anúncio rodando hoje">📣</span>}
                  </div>
                  <div className="font-mono mb-1" style={{ fontSize: 9.5, color: '#9ca3af' }}>{p.motherSku}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                    {sortBy === 'units' ? `${fmtNum(p.units)} un` : fmtMoney(p.revenue)}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#9ca3af' }}>
                    {sortBy === 'units' ? `${fmtMoney(avgPrice)} preço médio` : `${fmtNum(p.units)} un · ${fmtMoney(avgPrice)} médio`}
                  </div>
                  <div className="mt-1" style={{ fontSize: 10.5, fontWeight: 600, color: up ? '#16A34A' : '#dc2626' }}>
                    {up ? '↑' : '↓'} {deltaPct}% vs período ant.
                  </div>
                  <div className="mt-1 inline-block px-1.5 py-0.5 rounded" style={{ fontSize: 9.5, color: '#7c3aed', background: '#f3effc' }}>{shareTotal.toFixed(1)}% do total</div>
                </div>
              </div>
            );
          })}
          {catFiltered.length === 0 && <div className="card p-8 text-center text-sm w-full" style={{ color: '#6b7280' }}>Nenhum produto nesta categoria no período/busca.</div>}
          </div>
        </div>
      )}
      {!loadingPerf && !search.trim() && catFiltered.length > visible.length && (
        <div className="text-center mb-8">
          <button onClick={() => setShowAll(true)} className={PILL_INACTIVE} style={{ cursor: 'pointer' }}>
            Mostrar todos os {catFiltered.length} produtos
          </button>
        </div>
      )}
      {!loadingPerf && showAll && !search.trim() && catFiltered.length > INITIAL_CARDS && (
        <div className="text-center mb-8">
          <button onClick={() => setShowAll(false)} className="text-[12px] underline" style={{ color: '#9ca3af' }}>mostrar menos</button>
        </div>
      )}

      {/* Filtro de origem: In Stock / On-Demand / Pre-Order (Pre-Order = coleção de pré-venda) */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <span className="text-[11px] font-semibold uppercase mr-1" style={{ color: '#9ca3af', letterSpacing: '0.06em' }}>ORIGEM</span>
        <button onClick={() => setFulCats([])} className={pillBtn(fulCats.length === 0)}>Todas</button>
        {FULFILLMENT_CATEGORY_GROUPS.map((g) => {
          const active = g.cats.every((c) => fulCats.includes(c as FulfillmentCategory));
          return <button key={g.key} onClick={() => toggleFulGroup(g.cats)} className={pillBtn(active)}>{g.label}</button>;
        })}
        {fulCats.length > 0 && <span className="text-[11px] italic" style={{ color: '#9ca3af' }}>ranking, KPIs do período e gráficos · "hoje" mostra todas as origens</span>}
      </div>

      {/* KPIs DA SELEÇÃO (ao vivo de hoje + período) */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#16A34A' }}>● Ao vivo · hoje {today?.date ? `(${today.date})` : ''}</span>
        <span className="text-[11px] font-semibold" style={{ color: '#1A1A1A' }}>
          {selCount === 0 ? 'nenhum produto selecionado' : selCount === 1 ? selRows[0]?.name : `${selCount} produtos selecionados`}
        </span>
        <span className="text-[11px]" style={{ color: '#9ca3af' }}>· mercado: {today ? fmtNum(today.totalUnits) : '…'} un hoje · {fmtNum(perf?.totalUnits || 0)} un no período</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { live: true, label: 'UNIDADES HOJE', value: liveToday ? fmtNum(liveToday.units) : '…', sub: 'seleção · hoje' },
          { live: true, label: 'FATURAMENTO HOJE', value: liveToday ? fmtMoney(liveToday.revenue) : '…', sub: 'seleção · hoje' },
          { live: true, label: 'ROAS HOJE', value: !liveToday ? '…' : liveToday.roas != null ? `${liveToday.roas.toFixed(2)}x` : liveToday.hasAds ? '0.00x' : '— sem ads',
            sub: liveToday && liveToday.hasAds ? `spend ${fmtMoney(liveToday.spend)} · ads Meta` : 'sem SKU anunciado' },
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

      {/* Visão original: tabela de ranking (multi-select) + drill-down lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-[460px,1fr] gap-4 mb-8">
        {/* Ranking (tabela) */}
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
            {selCount > 0 && <button onClick={() => setSelected(new Set())} className="text-[11px] underline" style={{ color: '#9ca3af' }}>limpar ({selCount})</button>}
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
                          {p.name} {hasAds && <span title="Tem anúncio rodando hoje">📣</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ fontSize: 10, color: '#9ca3af' }}>{p.motherSku}</span>
                          <button onClick={(e) => { e.stopPropagation(); setSelected(new Set([p.motherSku])); }} className="text-[9px] underline" style={{ color: '#c7c2b6' }}>só este</button>
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
              {selCount > 0 && <>{fmtNum(selUnits)} un · {fmtMoney(selRevenue)} no período{market === 'ALL' && ' (US$)'}</>}
            </div>
          </div>
          {selCount === 0 && <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Selecione um ou mais produtos para ver a evolução.</div>}
          {selCount > 0 && loadingSeries && <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Carregando série…</div>}
          {selCount > 0 && !loadingSeries && unitPoints.length === 0 && <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Sem vendas da seleção no período.</div>}
          {selCount > 0 && !loadingSeries && unitPoints.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              <BarLineChart title={`UNIDADES VENDIDAS / TEMPO${selCount > 1 ? ' (soma da seleção)' : ''}`} data={unitPoints} color="#5d4ec5" unit="number" market={market === 'BR' ? 'BR' : 'US'} height={240} />
              <BarLineChart title={`FATURAMENTO / TEMPO${selCount > 1 ? ' (soma)' : ''}${market === 'ALL' ? ' · US$' : ''}`} data={revPoints} color="#16A34A" unit="currency" market={market === 'BR' ? 'BR' : 'US'} height={240} />
            </div>
          )}
        </div>
      </div>

    </main>
  );
}

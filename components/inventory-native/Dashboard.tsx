'use client';
// Cassia 2026-06-15: clone 100% fiel ao larroude-inventory-dashboard.vercel.app
// Source: DOCUMENTACAO-COMPLETA-dashboards-larroude.md + DESIGN-system-larroude.md
//
// Estrutura espelhada do original:
//   Header h1 + market pills + subtitle
//   → Ciclo do par banner (On-Demand → From-Batch → Em Trânsito → Em Estoque)
//   → Filter card (Período + Origem + Produção + Search)
//   → 🥇 Visão Geral (10 KPIs)
//   → 🎯 Matriz de Decisão (4 cards BCG)
//   → 📊 Concentração (Top 20)
//   → 🟢 Produzir mais (stockout iminente)
//   → 🔴 Capital parado (encalhe)
//   → 💰 Rentabilidade (3 cols margem)
//   → 📋 Tabela completa (BCG filter pills + paginação 30/pág)
//   → 🎁 Promoções sugeridas (3 cenários -10/-20/-30%)

import { useEffect, useMemo, useState } from 'react';

type Market = 'US' | 'BR';
type Period = '7d' | '14d' | '28d' | '3M' | '6M' | '12M';
type Origin = 'all' | 'preorder' | 'instock';
type Production = 'all' | 'ondemand' | 'frombatch';
type StatusClass = 'all' | 'produzir' | 'stockout' | 'manter' | 'avaliar' | 'encalhe' | 'margemneg' | 'reduzir' | 'inativo';

interface Row {
  s: string;
  n: string;
  m: string;
  r7?: number; q7?: number; c7?: number; p7?: number; p7q?: number;
  r14?: number; q14?: number; c14?: number; p14?: number; p14q?: number;
  r28?: number; q28?: number; c28?: number; p28?: number; p28q?: number;
  r3?: number; q3?: number; c3?: number; p3?: number; p3q?: number;
  r6?: number; q6?: number; c6?: number; p6?: number; p6q?: number;
  r12?: number; q12?: number; c12?: number; p12?: number; p12q?: number;
  q60?: number;
  e?: number; eo?: number; eb?: number;
  r?: number; t?: number;
  rp?: string | null; tp?: string | null;
  rnum?: string; tnum?: string;
  ap?: number;
}

interface Data {
  market: string;
  count: number;
  generatedAt: string;
  rows: Row[];
}

interface VariantRow {
  sku: string;
  size: string;
  inStock: number;
  onDemand: number;
  fromBatch: number;
  total: number;
}

const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '14d': 14, '28d': 28, '3M': 90, '6M': 180, '12M': 365 };
const PERIOD_LABEL: Record<Period, string> = { '7d': '7D', '14d': '14D', '28d': '28D', '3M': '3M', '6M': '6M', '12M': '12M' };

// Estrutura de margem (validado por Cassia 2026-05-29)
// BR: variável = ICMS+PIS+COFINS (27.3%) + Frete out (4.17%) + Payment (2.5%) + Devolução (8%) = 41.97%
//     fixo = Marketing 27.5%
// US: variável = Frete out (9.79%) + Payment (2.5%) + Devolução (15%) = 27.29%
//     fixo = Marketing 38.32%
const MARGIN_COSTS = {
  BR: { variable: 0.4197, fixed: 0.275 },
  US: { variable: 0.2729, fixed: 0.3832 },
};

function rev(r: Row, p: Period): number {
  const k = ({ '7d': 'r7', '14d': 'r14', '28d': 'r28', '3M': 'r3', '6M': 'r6', '12M': 'r12' } as const)[p];
  return (r as any)[k] ?? 0;
}
function qtyOf(r: Row, p: Period): number {
  const k = ({ '7d': 'q7', '14d': 'q14', '28d': 'q28', '3M': 'q3', '6M': 'q6', '12M': 'q12' } as const)[p];
  return (r as any)[k] ?? 0;
}
function cogsOf(r: Row, p: Period): number {
  const k = ({ '7d': 'c7', '14d': 'c14', '28d': 'c28', '3M': 'c3', '6M': 'c6', '12M': 'c12' } as const)[p];
  return (r as any)[k] ?? 0;
}
function dailyVel(r: Row, p: Period): number {
  return qtyOf(r, p) / PERIOD_DAYS[p];
}
function avgPrice(r: Row, p: Period): number {
  const q = qtyOf(r, p);
  if (q > 0) return rev(r, p) / q;
  return r.ap || 0;
}
function unitCost(r: Row, p: Period): number {
  const q = qtyOf(r, p);
  return q > 0 ? cogsOf(r, p) / q : 0;
}
function fmtMoney(v: number | null | undefined, market: Market, compact = true): string {
  if (v == null || !isFinite(v)) return '—';
  const cur = market === 'BR' ? 'R$' : '$';
  if (market === 'BR') {
    if (compact && Math.abs(v) >= 1_000_000) return `${cur}${(v / 1_000_000).toFixed(2)}M`;
    if (compact && Math.abs(v) >= 1000) return `${cur}${(v / 1000).toFixed(1)}k`;
    return `${cur}${Math.round(v).toLocaleString('pt-BR')}`;
  }
  if (compact && Math.abs(v) >= 1_000_000) return `${cur}${(v / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(v) >= 1000) return `${cur}${(v / 1000).toFixed(1)}k`;
  return `${cur}${Math.round(v).toLocaleString('en-US')}`;
}
function fmtNum(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}
function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    const d = new Date(v + (v.length === 10 ? 'T00:00:00Z' : ''));
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  } catch { return v; }
}

interface Processed {
  row: Row;
  revenue: number;
  qty: number;
  cogs: number;
  daily: number;
  cov: number | null;
  ap: number;
  uc: number;
  estoque: number;
  onDemand: number;
  emRemessa: number;
  emTransito: number;
  fatPrev: number;
  capParado: number;
  marginGross: number | null;
  marginContrib: number | null;
  marginNet: number | null;
  noSales60: boolean;
  status: StatusClass;
}

function classifyStatus(p: Omit<Processed, 'status'>): StatusClass {
  if (p.qty === 0 && p.estoque === 0) return 'inativo';
  if (p.qty > 0 && (p.cov ?? 999) < 14) return 'stockout';
  if (p.marginNet != null && p.marginNet < 0) return 'margemneg';
  if (p.noSales60 && p.estoque > 50) return 'encalhe';
  if (p.qty > 0 && (p.cov ?? 999) < 45) return 'produzir';
  if (p.qty > 0 && (p.cov ?? 999) >= 45 && (p.cov ?? 999) <= 120) return 'manter';
  if (p.qty > 0 && (p.cov ?? 999) > 120) return 'avaliar';
  if (p.qty === 0 && p.estoque > 0) return 'reduzir';
  return 'manter';
}

function process(r: Row, period: Period, market: Market): Processed {
  const revenue = rev(r, period);
  const qtyP = qtyOf(r, period);
  const cogsP = cogsOf(r, period);
  const daily = dailyVel(r, period);
  const estoque = r.e || 0;
  const onDemand = r.eo || 0;
  const emRemessa = r.eb || 0;
  const emTransito = r.t || 0;
  const ap = avgPrice(r, period);
  const uc = unitCost(r, period);
  const cov = daily > 0 ? estoque / daily : null;
  const fatPrev = estoque * ap;
  const capParado = estoque * uc;
  const marginGross = revenue > 0 ? (revenue - cogsP) / revenue : null;
  const costs = MARGIN_COSTS[market];
  const marginContrib = marginGross != null ? marginGross - costs.variable : null;
  const marginNet = marginGross != null ? marginGross - costs.variable - costs.fixed : null;
  const noSales60 = (r.q60 || 0) === 0;
  const partial: Omit<Processed, 'status'> = {
    row: r, revenue, qty: qtyP, cogs: cogsP, daily, cov, ap, uc,
    estoque, onDemand, emRemessa, emTransito, fatPrev, capParado,
    marginGross, marginContrib, marginNet, noSales60
  };
  return { ...partial, status: classifyStatus(partial) };
}

function origins(r: Row): { estoque: boolean; ondemand: boolean; frombatch: boolean; transit: boolean } {
  return {
    estoque: (r.e || 0) > 0,
    ondemand: (r.eo || 0) > 0,
    frombatch: (r.eb || 0) > 0,
    transit: (r.t || 0) > 0,
  };
}

const PAGE_SIZE = 15; // Cassia 2026-06-15: 15 linhas/pag em todos os blocos paginados

export default function InventoryDashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<Period>('3M');
  const [origin, setOrigin] = useState<Origin>('all');
  const [production, setProduction] = useState<Production>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusClass>('all');
  const [page, setPage] = useState(1);
  // Paginas das outras tabelas (Cassia 2026-06-15: 25 linhas/pag em todas)
  const [pageConc, setPageConc] = useState(1);
  const [pageProd, setPageProd] = useState(1);
  const [pageCap, setPageCap] = useState(1);
  const [pageRent, setPageRent] = useState(1);

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal drill-down de variantes
  const [selected, setSelected] = useState<{ sku: string; name: string } | null>(null);
  const [variants, setVariants] = useState<VariantRow[] | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/inventory/${market}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [market]);

  // Carrega variantes quando um produto é clicado na tabela Detalhe
  useEffect(() => {
    if (!selected) { setVariants(null); setVariantsError(null); return; }
    let cancelled = false;
    setVariantsLoading(true);
    setVariantsError(null);
    setVariants(null);
    fetch(`/api/inventory/${market}/variants/${encodeURIComponent(selected.sku)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        setVariants(d.variants || []);
      })
      .catch(e => {
        if (cancelled) return;
        setVariantsError(e?.message || 'Erro ao carregar variantes');
      })
      .finally(() => {
        if (!cancelled) setVariantsLoading(false);
      });
    return () => { cancelled = true; };
  }, [selected, market]);

  // Tecla ESC fecha o modal
  useEffect(() => {
    if (!selected) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [selected]);
  useEffect(() => {
    setPage(1); setPageConc(1); setPageProd(1); setPageCap(1); setPageRent(1);
  }, [statusFilter, search, origin, production, period, market]);

  // Drag-to-scroll: clicar e arrastar pra rolar dados nas áreas com overflow
  // (.list-card, .table-filters, .filter-card .btn-row)
  // Cassia 2026-06-15
  useEffect(() => {
    const selectors = '.inv-root .list-card, .inv-root .table-filters, .inv-root .filter-card .btn-row';
    let attached: Array<{ el: HTMLElement; cleanup: () => void }> = [];

    const attach = () => {
      const elements = document.querySelectorAll<HTMLElement>(selectors);
      elements.forEach(el => {
        if ((el as any).__dragAttached) return;
        (el as any).__dragAttached = true;

        let isDown = false;
        let startX = 0;
        let startY = 0;
        let scrollLeft = 0;
        let scrollTop = 0;
        let moved = false;

        const isInteractive = (target: EventTarget | null): boolean => {
          if (!(target instanceof HTMLElement)) return false;
          return !!target.closest('button, a, input, select, textarea, [role="button"]');
        };

        const onDown = (e: MouseEvent) => {
          if (isInteractive(e.target)) return;
          if (e.button !== 0) return;
          isDown = true;
          moved = false;
          // NÃO adicionar `dragging` aqui — só quando começar a mover de fato.
          // Adicionar no mousedown quebra o click dos <tr> (pointer-events: none).
          startX = e.pageX - el.offsetLeft;
          startY = e.pageY - el.offsetTop;
          scrollLeft = el.scrollLeft;
          scrollTop = el.scrollTop;
        };
        const onLeave = () => { isDown = false; el.classList.remove('dragging'); };
        const onUp = () => {
          if (isDown) {
            isDown = false;
            el.classList.remove('dragging');
          }
        };
        const onMove = (e: MouseEvent) => {
          if (!isDown) return;
          const x = e.pageX - el.offsetLeft;
          const y = e.pageY - el.offsetTop;
          const dx = (x - startX) * 1.4;
          const dy = (y - startY) * 1.4;
          // Só dispara o modo "dragging" depois de > 5px de movimento — assim cliques
          // simples não são engolidos pelo overlay de pointer-events: none.
          if (!moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            moved = true;
            el.classList.add('dragging');
          }
          if (moved) {
            e.preventDefault();
            el.scrollLeft = scrollLeft - dx;
            el.scrollTop = scrollTop - dy;
          }
        };
        // Evita que click dispare depois de drag
        const onClick = (e: MouseEvent) => {
          if (moved) {
            e.preventDefault();
            e.stopPropagation();
            moved = false;
          }
        };

        el.addEventListener('mousedown', onDown);
        el.addEventListener('mouseleave', onLeave);
        window.addEventListener('mouseup', onUp);
        el.addEventListener('mousemove', onMove);
        el.addEventListener('click', onClick, true);

        attached.push({
          el,
          cleanup: () => {
            el.removeEventListener('mousedown', onDown);
            el.removeEventListener('mouseleave', onLeave);
            window.removeEventListener('mouseup', onUp);
            el.removeEventListener('mousemove', onMove);
            el.removeEventListener('click', onClick, true);
            (el as any).__dragAttached = false;
          }
        });
      });
    };

    // Attach na primeira render + reattach após mudanças de data/filtro
    const t = setTimeout(attach, 50);

    // MutationObserver: re-anexa quando novos blocos aparecem (paginação, status filter)
    const observer = new MutationObserver(() => {
      // Debounce: só re-anexa se há novos elementos sem listener
      attach();
    });
    const root = document.querySelector('.inv-root');
    if (root) observer.observe(root, { childList: true, subtree: true });

    return () => {
      clearTimeout(t);
      observer.disconnect();
      attached.forEach(a => a.cleanup());
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [] as Row[];
    let r = data.rows.slice();
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(x => (x.s || '').toLowerCase().includes(q) || (x.n || '').toLowerCase().includes(q));
    }
    if (origin !== 'all') {
      r = r.filter(x => {
        const o = origins(x);
        if (origin === 'preorder') return o.ondemand || o.frombatch;
        if (origin === 'instock') return o.estoque;
        return true;
      });
    }
    if (production !== 'all') {
      r = r.filter(x => {
        const o = origins(x);
        if (production === 'ondemand') return o.ondemand;
        if (production === 'frombatch') return o.frombatch;
        return true;
      });
    }
    return r;
  }, [data, search, origin, production]);

  const processed = useMemo(() => filtered.map(r => process(r, period, market)), [filtered, period, market]);

  const kpis = useMemo(() => {
    const sum = (k: keyof Processed) => processed.reduce((a, x) => a + ((x[k] as number) || 0), 0);
    const revP = sum('revenue');
    const cogsP = sum('cogs');
    const qtyP = sum('qty');
    const ticket = qtyP > 0 ? revP / qtyP : 0;
    const grossWeighted = revP > 0 ? (revP - cogsP) / revP : 0;
    const costs = MARGIN_COSTS[market];
    const netWeighted = grossWeighted > 0 ? grossWeighted - costs.variable - costs.fixed : 0;
    const contribWeighted = grossWeighted > 0 ? grossWeighted - costs.variable : 0;
    const modelosAtivos = processed.filter(x => x.qty > 0).length;
    const emEstoque = sum('estoque');
    const onDemand = sum('onDemand');
    const emRemessa = sum('emRemessa');
    const emTransito = sum('emTransito');
    const fatPrevisto = sum('fatPrev');
    return { revP, cogsP, qtyP, ticket, grossWeighted, contribWeighted, netWeighted, modelosAtivos, emEstoque, onDemand, emRemessa, emTransito, fatPrevisto };
  }, [processed, market]);

  const matriz = useMemo(() => {
    const counts: Record<StatusClass, number> = { all: 0, produzir: 0, stockout: 0, manter: 0, avaliar: 0, encalhe: 0, margemneg: 0, reduzir: 0, inativo: 0 };
    const revs: Record<StatusClass, number> = { all: 0, produzir: 0, stockout: 0, manter: 0, avaliar: 0, encalhe: 0, margemneg: 0, reduzir: 0, inativo: 0 };
    for (const p of processed) {
      counts[p.status]++;
      counts.all++;
      revs[p.status] += p.revenue;
      revs.all += p.revenue;
    }
    return { counts, revs };
  }, [processed]);

  // Listas COMPLETAS (sem slice — paginadas no render)
  const concentracaoFull = useMemo(() => {
    const sorted = [...processed].sort((a, b) => b.revenue - a.revenue);
    let acc = 0;
    return sorted.map((p, i) => {
      const pct = kpis.revP > 0 ? p.revenue / kpis.revP : 0;
      acc += pct;
      return { p, pct, acc, rank: i + 1 };
    });
  }, [processed, kpis.revP]);

  const produzirMaisFull = useMemo(() => {
    return [...processed]
      .filter(p => p.cov != null && p.cov < 30 && p.daily > 0.3)
      .sort((a, b) => (a.cov! - b.cov!));
  }, [processed]);

  const capitalParadoFull = useMemo(() => {
    return [...processed]
      .filter(p => p.estoque > 100 && (p.noSales60 || p.daily < 0.05))
      .sort((a, b) => b.capParado - a.capParado);
  }, [processed]);

  const rentabilidadeFull = useMemo(() => {
    return [...processed]
      .filter(p => p.qty >= 5 && p.marginNet != null)
      .sort((a, b) => (a.marginNet ?? 999) - (b.marginNet ?? 999));
  }, [processed]);

  // Slices paginados
  const totalPagesConc = Math.max(1, Math.ceil(concentracaoFull.length / PAGE_SIZE));
  const totalPagesProd = Math.max(1, Math.ceil(produzirMaisFull.length / PAGE_SIZE));
  const totalPagesCap = Math.max(1, Math.ceil(capitalParadoFull.length / PAGE_SIZE));
  const totalPagesRent = Math.max(1, Math.ceil(rentabilidadeFull.length / PAGE_SIZE));
  const concentracao = concentracaoFull.slice((pageConc - 1) * PAGE_SIZE, pageConc * PAGE_SIZE);
  const produzirMais = produzirMaisFull.slice((pageProd - 1) * PAGE_SIZE, pageProd * PAGE_SIZE);
  const capitalParado = capitalParadoFull.slice((pageCap - 1) * PAGE_SIZE, pageCap * PAGE_SIZE);
  const rentabilidade = rentabilidadeFull.slice((pageRent - 1) * PAGE_SIZE, pageRent * PAGE_SIZE);

  const detalheFull = useMemo(() => {
    return [...processed]
      .filter(p => statusFilter === 'all' || p.status === statusFilter)
      .sort((a, b) => b.revenue - a.revenue);
  }, [processed, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(detalheFull.length / PAGE_SIZE));
  const detalhe = detalheFull.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const promocoes = useMemo(() => {
    return [...processed]
      .filter(p => p.cov != null && p.cov > 180 && p.estoque > 50 && p.ap > 0 && p.uc > 0)
      .sort((a, b) => (b.cov! - a.cov!))
      .slice(0, 6);
  }, [processed]);

  return (
    <div className="inv-root">
      <div className="app">

        {/* Header — padronizado com os demais dashboards do Performance OS */}
        <header className="mb-6">
          <div className="pt-8 pb-2 flex items-start justify-between gap-4 flex-wrap">
            <h1 className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
                style={{ color: 'var(--inv-ink)', letterSpacing: '-0.025em' }}>
              Inventory Intelligence
            </h1>
            <button onClick={load} disabled={loading} style={{
              background: 'var(--inv-paper)',
              border: '1.5px solid var(--inv-line)', borderRadius: 100,
              padding: '8px 18px', fontWeight: 700, fontSize: 13,
              color: 'var(--inv-ink-2)', cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1, fontFamily: 'inherit',
              alignSelf: 'center',
            }}>
              {loading ? '⏳ Carregando…' : '↻ Atualizar'}
            </button>
          </div>
          <div className="market-row" style={{ marginTop: 8 }}>
            <button className={`market-pill ${market === 'US' ? 'active' : ''}`} onClick={() => setMarket('US')}>
              <span className="flag">US</span>
              United States
            </button>
            <button className={`market-pill ${market === 'BR' ? 'active' : ''}`} onClick={() => setMarket('BR')}>
              <span className="flag">BR</span>
              Brasil
            </button>
          </div>
          <p className="subtitle">
            Decisão de produção por modelo · com base em <b>venda real, custo e estoque atual</b>
            {data && <> · dados de <b>{fmtDate(data.generatedAt)}</b></>}
            {' · '}BigQuery Larroudé OS · apenas <b>DTC</b> · exclui B2B, Marketplace, Influencer e Gift Cards
          </p>
        </header>

        {/* Ciclo do Par */}
        <div className="ciclo-banner">
          <span className="ciclo-label">CICLO DO PAR</span>
          <span className="ciclo-pill" style={{ background: 'var(--inv-purple-soft)', color: 'var(--inv-purple)' }}>
            <span className="dot" style={{ background: 'var(--inv-purple)' }} />
            <b>1. On-Demand</b>
            <span className="ciclo-desc">vendido, não entrou na produção</span>
          </span>
          <span className="ciclo-arrow">→</span>
          <span className="ciclo-pill" style={{ background: 'var(--inv-orange-soft)', color: 'var(--inv-orange)' }}>
            <span className="dot" style={{ background: 'var(--inv-orange)' }} />
            <b>2. Em Remessa · From-Batch</b>
            <span className="ciclo-desc">sendo produzido agora</span>
          </span>
          <span className="ciclo-arrow">→</span>
          <span className="ciclo-pill" style={{ background: 'var(--inv-gold-soft)', color: 'var(--inv-gold)' }}>
            <span className="dot" style={{ background: 'var(--inv-gold)' }} />
            <b>3. Em Trânsito</b>
            <span className="ciclo-desc">produzido, indo pro warehouse</span>
          </span>
          <span className="ciclo-arrow">→</span>
          <span className="ciclo-pill" style={{ background: 'var(--inv-green-soft)', color: 'var(--inv-green)' }}>
            <span className="dot" style={{ background: 'var(--inv-green)' }} />
            <b>4. Em Estoque</b>
            <span className="ciclo-desc">no warehouse, pronto pra venda</span>
          </span>
        </div>

        {/* Filter card */}
        <div className="filter-card">
          <div className="filter-group">
            <span className="filter-label">PERÍODO</span>
            <div className="btn-row">
              {(['7d','14d','28d','3M','6M','12M'] as Period[]).map(p => (
                <button key={p} className={`btn-pill ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">ORIGEM</span>
            <div className="btn-row">
              <button className={`btn-pill ${origin === 'all' ? 'active' : ''}`} onClick={() => setOrigin('all')}>Todos</button>
              <button className={`btn-pill ${origin === 'preorder' ? 'active' : ''}`} onClick={() => setOrigin('preorder')}>Pre-Order</button>
              <button className={`btn-pill ${origin === 'instock' ? 'active' : ''}`} onClick={() => setOrigin('instock')}>In-Stock</button>
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">PRODUÇÃO</span>
            <div className="btn-row">
              <button className={`btn-pill ${production === 'all' ? 'active' : ''}`} onClick={() => setProduction('all')}>Todos</button>
              <button className={`btn-pill ${production === 'ondemand' ? 'active' : ''}`} onClick={() => setProduction('ondemand')}>On-Demand</button>
              <button className={`btn-pill ${production === 'frombatch' ? 'active' : ''}`} onClick={() => setProduction('frombatch')}>From-Batch</button>
            </div>
          </div>
          <input className="search-input" placeholder="Buscar por nome ou SKU…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {error && (
          <div style={{ background: 'var(--inv-red-soft)', color: 'var(--inv-red)', padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontWeight: 600, fontSize: 13 }}>
            Erro ao carregar: {error}
          </div>
        )}

        {/* 🥇 Visão Geral */}
        <div className="section-head" id="sec-visao">
          <span className="section-pill sp-gold">🥇 Visão Geral</span>
          <span className="title">
            <b>{market === 'US' ? 'UNITED STATES' : 'BRASIL'}</b> · {PERIOD_LABEL[period]}
          </span>
          <span className="right-info">{kpis.modelosAtivos} modelos ativos</span>
        </div>
        <div className="kpi-grid kpi-grid-8">
          <Kpi label="Faturamento" value={fmtMoney(kpis.revP, market)} sub={`${fmtNum(kpis.qtyP)} unidades`} />
          <Kpi label="COGS no Período" value={fmtMoney(kpis.cogsP, market)} sub={`${fmtPct(kpis.revP > 0 ? kpis.cogsP / kpis.revP : 0)} do faturamento`} />
          <Kpi
            label="Margem Líquida"
            value={fmtPct(kpis.netWeighted)}
            sub={<>bruta <b>{fmtPct(kpis.grossWeighted)}</b> · contrib <b>{fmtPct(kpis.contribWeighted)}</b></>}
            highlight={kpis.netWeighted < 0 ? 'red' : kpis.netWeighted < 0.1 ? 'gold' : 'green'}
          />
          {/* Cassia 2026-07-02: "Ticket Médio" -> "AOV" (termo usado em todas as outras abas) */}
          <Kpi label="AOV" value={fmtMoney(kpis.ticket, market, false)} />
          <Kpi label="Em Estoque" value={fmtNum(kpis.emEstoque)} sub="warehouse" tone="green" />
          <Kpi label="On-Demand" value={fmtNum(kpis.onDemand)} sub="vendido, não produzido" tone="purple" />
          <Kpi label="Em Remessa · From-Batch" value={fmtNum(kpis.emRemessa)} sub="produzindo agora" tone="orange" />
          <Kpi label="Em Trânsito" value={fmtNum(kpis.emTransito)} sub="indo pro warehouse" tone="gold" />
        </div>
        <div className="kpi-grid kpi-grid-4" style={{ marginTop: 10 }}>
          <Kpi label="Faturamento Previsto" value={fmtMoney(kpis.fatPrevisto, market)} sub="estoque atual × preço atual" tone="green" />
          <Kpi label="Modelos Ativos" value={fmtNum(kpis.modelosAtivos)} sub={`de ${fmtNum(processed.length)} no catálogo`} />
          <Kpi label="Estoque Total" value={fmtNum(kpis.emEstoque + kpis.onDemand + kpis.emRemessa + kpis.emTransito)} sub="todas as etapas do ciclo" />
          <Kpi
            label="Stockout"
            value={fmtNum(matriz.counts.stockout)}
            sub={<>+ <b>{matriz.counts.margemneg}</b> marg. neg · <b>{matriz.counts.encalhe}</b> encalhe</>}
            highlight="red"
          />
        </div>

        {/* 🎯 Matriz de Decisão */}
        <div className="section-head" id="sec-matriz">
          <span className="section-pill sp-blue">🎯 Matriz de Decisão</span>
          <span className="title">Classificação BCG · clique para filtrar a tabela completa</span>
        </div>
        <div className="matrix-grid">
          <MatrixCard tone="green" emoji="🟢" label="Produzir mais"
            count={matriz.counts.produzir + matriz.counts.stockout}
            revenue={matriz.revs.produzir + matriz.revs.stockout} market={market}
            desc="Cobertura curta + velocidade alta. Risco de stockout."
            onClick={() => { setStatusFilter('produzir'); document.getElementById('sec-detalhe')?.scrollIntoView({ behavior: 'smooth' }); }} />
          <MatrixCard tone="blue" emoji="🔵" label="Manter"
            count={matriz.counts.manter} revenue={matriz.revs.manter} market={market}
            desc="Cobertura 45-120d. Estoque saudável."
            onClick={() => { setStatusFilter('manter'); document.getElementById('sec-detalhe')?.scrollIntoView({ behavior: 'smooth' }); }} />
          <MatrixCard tone="gold" emoji="🟡" label="Avaliar"
            count={matriz.counts.avaliar} revenue={matriz.revs.avaliar} market={market}
            desc="Cobertura > 120d. Vendendo, mas sobrando."
            onClick={() => { setStatusFilter('avaliar'); document.getElementById('sec-detalhe')?.scrollIntoView({ behavior: 'smooth' }); }} />
          <MatrixCard tone="red" emoji="🔴" label="Reduzir / Parar"
            count={matriz.counts.encalhe + matriz.counts.margemneg + matriz.counts.reduzir + matriz.counts.inativo}
            revenue={matriz.revs.encalhe + matriz.revs.margemneg + matriz.revs.reduzir + matriz.revs.inativo} market={market}
            desc="Encalhe, margem negativa ou inativos."
            onClick={() => { setStatusFilter('encalhe'); document.getElementById('sec-detalhe')?.scrollIntoView({ behavior: 'smooth' }); }} />
        </div>

        {/* 📊 Concentração */}
        <div className="section-head" id="sec-conc">
          <span className="section-pill sp-teal">📊 Concentração</span>
          <span className="title">Modelos por faturamento · análise ABC · % acumulado mostra Pareto</span>
          <span className="right-info">{concentracaoFull.length} modelos</span>
        </div>
        <div className="list-card">
          <table className="list-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Produto</th>
                <th>Produção</th>
                <th className="num">Faturamento</th>
                <th className="num">% do total</th>
                <th className="num">% acumulado</th>
                <th className="num">Unidades</th>
                <th className="num">Velocidade</th>
                <th className="num">Estoque</th>
                <th className="num">Cobertura</th>
                <th className="num">Em Remessa</th>
                <th className="num">Em Trânsito</th>
              </tr>
            </thead>
            <tbody>
              {concentracao.map(x => (
                <tr key={x.p.row.s}>
                  <td className="rank">{x.rank}</td>
                  <ProductCell row={x.p.row} />
                  <ProductionCell row={x.p.row} />
                  <td className="num"><b>{fmtMoney(x.p.revenue, market)}</b></td>
                  <td className="num">{(x.pct * 100).toFixed(2)}%</td>
                  <td className="num" style={{ color: x.acc <= 0.8 ? 'var(--inv-ink)' : 'var(--inv-ink-3)' }}>{(x.acc * 100).toFixed(1)}%</td>
                  <td className="num">{fmtNum(x.p.qty)}</td>
                  <td className="num" style={{ fontSize: 11, color: 'var(--inv-ink-3)' }}>{x.p.daily.toFixed(1)} un/d</td>
                  <td className="num">{fmtNum(x.p.estoque)}</td>
                  <td className="num"><CoverageBadge cov={x.p.cov} /></td>
                  <td className="num"><RemessaInfo qty={x.p.emRemessa} when={x.p.row.rp} po={x.p.row.rnum} /></td>
                  <td className="num"><RemessaInfo qty={x.p.emTransito} when={x.p.row.tp} po={x.p.row.tnum} tone="gold" /></td>
                </tr>
              ))}
              {concentracao.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: 'var(--inv-ink-3)' }}>Sem dados pra este filtro.</td></tr>
              )}
            </tbody>
          </table>
          <Paginator page={pageConc} totalPages={totalPagesConc} total={concentracaoFull.length} setPage={setPageConc} />
        </div>

        {/* 🟢 Produzir mais */}
        <div className="section-head" id="sec-produzir">
          <span className="section-pill sp-green">🟢 Produzir mais</span>
          <span className="title">Stockout iminente · cobertura &lt; 30d · velocidade &gt; 0,3 un/dia</span>
          <span className="right-info">{produzirMais.length} modelos</span>
        </div>
        <div className="list-card">
          <table className="list-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Produto</th>
                <th>Produção</th>
                <th className="num">Estoque</th>
                <th className="num">Faturamento</th>
                <th className="num">Velocidade</th>
                <th>Cobertura</th>
                <th className="num">Em Remessa</th>
                <th className="num">Em Trânsito</th>
              </tr>
            </thead>
            <tbody>
              {produzirMais.map((p, i) => (
                <tr key={p.row.s}>
                  <td className="rank">{i + 1}</td>
                  <ProductCell row={p.row} />
                  <ProductionCell row={p.row} />
                  <td className="num"><b>{fmtNum(p.estoque)}</b></td>
                  <td className="num">{fmtMoney(p.revenue, market)}</td>
                  <td className="num" style={{ fontSize: 11, color: 'var(--inv-ink-3)' }}>{p.daily.toFixed(2)} un/d</td>
                  <td>
                    <div className="bar-wrap">
                      <div className="bar-track">
                        <div className="bar-fill b-red" style={{ width: `${Math.min(100, ((p.cov || 0) / 30) * 100)}%` }} />
                      </div>
                      <div className="bar-num" style={{ color: 'var(--inv-red)' }}>{p.cov != null ? `${Math.round(p.cov)}d` : '—'}</div>
                    </div>
                  </td>
                  <td className="num"><RemessaInfo qty={p.emRemessa} when={p.row.rp} /></td>
                  <td className="num"><RemessaInfo qty={p.emTransito} when={p.row.tp} /></td>
                </tr>
              ))}
              {produzirMais.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--inv-ink-3)' }}>Nenhum modelo em risco de stockout. 👍</td></tr>
              )}
            </tbody>
          </table>
          <Paginator page={pageProd} totalPages={totalPagesProd} total={produzirMaisFull.length} setPage={setPageProd} />
        </div>

        {/* 🔴 Capital parado */}
        <div className="section-head" id="sec-capital">
          <span className="section-pill sp-red">🔴 Capital parado</span>
          <span className="title">Estoque &gt; 100 + venda lenta · candidatos a liquidação</span>
          <span className="right-info">{capitalParado.length} modelos</span>
        </div>
        <div className="list-card">
          <table className="list-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Produto</th>
                <th>Produção</th>
                <th className="num">Vendas 60d</th>
                <th className="num">Faturamento</th>
                <th className="num">Estoque</th>
                <th className="num">Custo unit.</th>
                <th>Capital parado</th>
                <th className="num">Fat. previsto</th>
                <th className="num">Em Remessa</th>
                <th className="num">Em Trânsito</th>
              </tr>
            </thead>
            <tbody>
              {capitalParado.map((p, i) => {
                const maxCap = capitalParado[0]?.capParado || 1;
                return (
                  <tr key={p.row.s}>
                    <td className="rank">{i + 1}</td>
                    <ProductCell row={p.row} />
                    <ProductionCell row={p.row} />
                    <td className="num">{fmtNum(p.row.q60 || 0)}</td>
                    <td className="num">{fmtMoney(p.revenue, market)}</td>
                    <td className="num"><b>{fmtNum(p.estoque)}</b></td>
                    <td className="num">{fmtMoney(p.uc, market, false)}</td>
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-track">
                          <div className="bar-fill b-red" style={{ width: `${(p.capParado / maxCap) * 100}%` }} />
                        </div>
                        <div className="bar-num" style={{ color: 'var(--inv-red)' }}>{fmtMoney(p.capParado, market)}</div>
                      </div>
                    </td>
                    <td className="num">{fmtMoney(p.fatPrev, market)}</td>
                    <td className="num"><RemessaInfo qty={p.emRemessa} when={p.row.rp} /></td>
                    <td className="num"><RemessaInfo qty={p.emTransito} when={p.row.tp} /></td>
                  </tr>
                );
              })}
              {capitalParado.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: 'var(--inv-ink-3)' }}>Nenhum modelo com capital parado significativo. 👍</td></tr>
              )}
            </tbody>
          </table>
          <Paginator page={pageCap} totalPages={totalPagesCap} total={capitalParadoFull.length} setPage={setPageCap} />
        </div>

        {/* 💰 Rentabilidade */}
        <div className="section-head" id="sec-rent">
          <span className="section-pill sp-orange">💰 Rentabilidade</span>
          <span className="title">
            Menor margem líquida · {market === 'BR'
              ? 'após impostos (27,3%), frete (4,2%), pagamento (2,5%), devolução (8%) + marketing (27,5%)'
              : 'após frete (9,8%), pagamento (2,5%), devolução (15%) + marketing (38,3%)'}
          </span>
          <span className="right-info">mínimo 5 un</span>
        </div>
        <div className="list-card">
          <table className="list-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Produto</th>
                <th>Produção</th>
                <th className="num">Faturamento</th>
                <th className="num">COGS</th>
                <th className="num">Bruta</th>
                <th className="num">Contrib.</th>
                <th>Líquida</th>
              </tr>
            </thead>
            <tbody>
              {rentabilidade.map((p, i) => {
                const bruta = (p.marginGross ?? 0);
                const contrib = (p.marginContrib ?? 0);
                const liq = (p.marginNet ?? 0);
                return (
                  <tr key={p.row.s}>
                    <td className="rank">{i + 1}</td>
                    <ProductCell row={p.row} />
                    <ProductionCell row={p.row} />
                    <td className="num">{fmtMoney(p.revenue, market)}</td>
                    <td className="num">{fmtMoney(p.cogs, market)}</td>
                    <td className="num">{fmtPct(bruta)}</td>
                    <td className="num" style={{ color: contrib < 0 ? 'var(--inv-red)' : contrib < 0.2 ? 'var(--inv-gold)' : 'var(--inv-ink)' }}>
                      {fmtPct(contrib)}
                    </td>
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-track">
                          <div className={`bar-fill ${liq < 0 ? 'b-red' : liq < 0.1 ? 'b-gold' : 'b-green'}`}
                            style={{ width: `${Math.min(100, Math.max(2, Math.abs(liq) * 200))}%` }} />
                        </div>
                        <div className="bar-num" style={{ color: liq < 0 ? 'var(--inv-red)' : liq < 0.1 ? 'var(--inv-gold)' : 'var(--inv-green)' }}>
                          {fmtPct(liq)}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rentabilidade.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--inv-ink-3)' }}>Sem modelos suficientes para análise.</td></tr>
              )}
            </tbody>
          </table>
          <Paginator page={pageRent} totalPages={totalPagesRent} total={rentabilidadeFull.length} setPage={setPageRent} />
        </div>

        {/* 📋 Detalhe */}
        <div className="section-head" id="sec-detalhe">
          <span className="section-pill sp-purple">📋 Detalhe</span>
          <span className="title">Tabela completa · todos os modelos · <b>duplo-clique abre estoque por tamanho</b></span>
          <span className="right-info">{detalheFull.length} modelos</span>
        </div>
        <div className="list-card">
          <div className="table-filters">
            <span className="label">STATUS</span>
            <button className={`st-pill ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
              Todos <span className="count">{matriz.counts.all}</span>
            </button>
            <span className="divider">·</span>
            <button className={`st-pill ${statusFilter === 'produzir' ? 'active' : ''}`} onClick={() => setStatusFilter('produzir')}>
              🟢 Produzir <span className="count">{matriz.counts.produzir}</span>
            </button>
            <button className={`st-pill ${statusFilter === 'stockout' ? 'active' : ''}`} onClick={() => setStatusFilter('stockout')}>
              ⚠️ Stockout <span className="count">{matriz.counts.stockout}</span>
            </button>
            <button className={`st-pill ${statusFilter === 'manter' ? 'active' : ''}`} onClick={() => setStatusFilter('manter')}>
              🔵 Manter <span className="count">{matriz.counts.manter}</span>
            </button>
            <button className={`st-pill ${statusFilter === 'avaliar' ? 'active' : ''}`} onClick={() => setStatusFilter('avaliar')}>
              🟡 Avaliar <span className="count">{matriz.counts.avaliar}</span>
            </button>
            <button className={`st-pill ${statusFilter === 'encalhe' ? 'active' : ''}`} onClick={() => setStatusFilter('encalhe')}>
              🔴 Encalhe <span className="count">{matriz.counts.encalhe}</span>
            </button>
            <button className={`st-pill ${statusFilter === 'margemneg' ? 'active' : ''}`} onClick={() => setStatusFilter('margemneg')}>
              💸 Marg. neg <span className="count">{matriz.counts.margemneg}</span>
            </button>
            <button className={`st-pill ${statusFilter === 'reduzir' ? 'active' : ''}`} onClick={() => setStatusFilter('reduzir')}>
              ⛔ Reduzir <span className="count">{matriz.counts.reduzir}</span>
            </button>
            <button className={`st-pill ${statusFilter === 'inativo' ? 'active' : ''}`} onClick={() => setStatusFilter('inativo')}>
              💤 Inativo <span className="count">{matriz.counts.inativo}</span>
            </button>
          </div>
          <table className="list-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Produção</th>
                <th className="num">Faturamento</th>
                <th className="num">% do tot.</th>
                <th className="num">Unidades</th>
                <th className="num">COGS</th>
                <th className="num">Margem<br /><span style={{ fontWeight: 400, color: 'var(--inv-ink-4)' }}>bru · contrib · líq</span></th>
                <th className="num">Custo unit.</th>
                <th className="num">Estoque</th>
                <th className="num">Cap. parado</th>
                <th className="num">Fat. previsto</th>
                <th className="num">Cobertura</th>
                <th className="num" style={{ color: 'var(--inv-orange)' }}>Em Remessa</th>
                <th className="num" style={{ color: 'var(--inv-gold)' }}>Em Trânsito</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.map(p => {
                const pctTot = kpis.revP > 0 ? p.revenue / kpis.revP : 0;
                return (
                  <tr
                    key={p.row.s}
                    onDoubleClick={() => setSelected({ sku: p.row.s, name: p.row.n })}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    title="Duplo-clique para ver estoque por tamanho"
                  >
                    <ProductCell row={p.row} />
                    <ProductionCell row={p.row} />
                    <td className="num"><b>{fmtMoney(p.revenue, market)}</b></td>
                    <td className="num">{(pctTot * 100).toFixed(2)}%</td>
                    <td className="num">{fmtNum(p.qty)}</td>
                    <td className="num">{fmtMoney(p.cogs, market)}</td>
                    <td className="num" style={{ fontSize: 11 }}>
                      {fmtPct(p.marginGross)} · {fmtPct(p.marginContrib)} · <b style={{ color: (p.marginNet ?? 0) < 0 ? 'var(--inv-red)' : (p.marginNet ?? 0) < 0.1 ? 'var(--inv-gold)' : 'var(--inv-green)' }}>{fmtPct(p.marginNet)}</b>
                    </td>
                    <td className="num">{fmtMoney(p.uc, market, false)}</td>
                    <td className="num">{fmtNum(p.estoque)}</td>
                    <td className="num">{fmtMoney(p.capParado, market)}</td>
                    <td className="num">{fmtMoney(p.fatPrev, market)}</td>
                    <td className="num"><CoverageBadge cov={p.cov} /></td>
                    <td className="num"><RemessaInfo qty={p.emRemessa} when={p.row.rp} po={p.row.rnum} /></td>
                    <td className="num"><RemessaInfo qty={p.emTransito} when={p.row.tp} po={p.row.tnum} tone="gold" /></td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                );
              })}
              {detalhe.length === 0 && (
                <tr><td colSpan={15} style={{ textAlign: 'center', padding: 40, color: 'var(--inv-ink-3)' }}>Nenhum modelo com este filtro.</td></tr>
              )}
            </tbody>
          </table>
          <div className="pagination">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹ Anterior</button>
            <span className="pg-info">
              Página <b>{page}</b> de <b>{totalPages}</b> · mostrando {detalhe.length} de {detalheFull.length}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Próxima ›</button>
          </div>
        </div>

        {/* 🎁 Promoções */}
        {promocoes.length > 0 && (
          <>
            <div className="section-head" id="sec-promo">
              <span className="section-pill sp-pink">🎁 Promoções sugeridas</span>
              <span className="title">Cobertura &gt; 6 meses · 3 cenários de desconto com margem recalculada</span>
              <span className="right-info">{promocoes.length} modelos</span>
            </div>
            <div className="matrix-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {promocoes.map(p => {
                const variableCost = MARGIN_COSTS[market].variable;
                const scenarios = [0.10, 0.20, 0.30].map(disc => {
                  const newPrice = p.ap * (1 - disc);
                  const newMargin = newPrice > 0 ? (newPrice - p.uc - newPrice * variableCost) / newPrice : null;
                  return { disc, newPrice, newMargin };
                });
                const bestIdx = scenarios.reduce((best, s, i) => (s.newMargin != null && s.newMargin > 0.15) ? i : best, -1);
                return (
                  <div key={p.row.s} className="promo-card">
                    <div className="promo-name">{p.row.n}</div>
                    <div className="promo-sku">{p.row.s}</div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--inv-ink-3)', flexWrap: 'wrap' }}>
                      <span>Estoque <b style={{ color: 'var(--inv-ink)' }}>{fmtNum(p.estoque)}</b></span>
                      <span>Cobertura <b style={{ color: 'var(--inv-red)' }}>{Math.round(p.cov!)}d</b></span>
                      <span>Custo unit. <b style={{ color: 'var(--inv-ink)' }}>{fmtMoney(p.uc, market, false)}</b></span>
                      <span>Preço atual <b style={{ color: 'var(--inv-ink)' }}>{fmtMoney(p.ap, market, false)}</b></span>
                    </div>
                    <div className="promo-scenarios">
                      {scenarios.map((s, i) => (
                        <div key={s.disc} className="promo-scen" style={{
                          background: i === bestIdx ? 'var(--inv-pink-soft)' : 'var(--inv-bg-soft)',
                          border: i === bestIdx ? '1.5px solid var(--inv-pink)' : 'none'
                        }}>
                          <div className="scen-label">-{(s.disc * 100).toFixed(0)}%</div>
                          <div className="scen-margin" style={{ color: (s.newMargin ?? 0) < 0 ? 'var(--inv-red)' : (s.newMargin ?? 0) < 0.1 ? 'var(--inv-gold)' : 'var(--inv-green)' }}>
                            {fmtPct(s.newMargin)}
                          </div>
                          <div className="scen-price">{fmtMoney(s.newPrice, market, false)}</div>
                        </div>
                      ))}
                    </div>
                    {bestIdx >= 0 && (
                      <div className="promo-rec">
                        💡 Recomendação: <b>-{(scenarios[bestIdx].disc * 100).toFixed(0)}%</b> mantém margem &gt; 15%
                      </div>
                    )}
                    {bestIdx < 0 && (
                      <div className="promo-rec" style={{ color: 'var(--inv-red)' }}>
                        ⚠️ Sem desconto rentável · considere parar de produzir
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="foot">
          Larroudé Inventory Intelligence · {data ? `gerado em ${fmtDate(data.generatedAt)}` : '—'} · BigQuery Larroudé OS
        </div>
      </div>

      {/* Modal Drill-Down: estoque por variante (tamanho) */}
      {selected && (
        <VariantsModal
          sku={selected.sku}
          name={selected.name}
          variants={variants}
          loading={variantsLoading}
          error={variantsError}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ============================== sub-componentes ============================== */

function Kpi({ label, value, sub, tone, highlight }: {
  label: string; value: string; sub?: React.ReactNode;
  tone?: 'green' | 'purple' | 'orange' | 'gold' | 'red' | 'blue';
  highlight?: 'red' | 'gold' | 'green';
}) {
  const styles: any = {};
  if (highlight === 'red') styles.background = 'linear-gradient(180deg, var(--inv-red-soft) 0%, var(--inv-paper) 100%)';
  if (highlight === 'gold') styles.background = 'linear-gradient(180deg, var(--inv-gold-soft) 0%, var(--inv-paper) 100%)';
  if (highlight === 'green') styles.background = 'linear-gradient(180deg, var(--inv-green-soft) 0%, var(--inv-paper) 100%)';
  if (highlight) styles.borderColor = `var(--inv-${highlight})`;
  if (tone && !highlight) {
    const c = `var(--inv-${tone}-soft)`;
    styles.background = `linear-gradient(180deg, ${c} 0%, var(--inv-paper) 100%)`;
  }
  return (
    <div className="kpi" style={styles}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function MatrixCard({ tone, emoji, label, count, revenue, market, desc, onClick }: {
  tone: 'green' | 'blue' | 'gold' | 'red';
  emoji: string; label: string; count: number; revenue: number; market: Market;
  desc: string; onClick?: () => void;
}) {
  return (
    <div className={`matrix-card mc-${tone}`} onClick={onClick}>
      <div className="quad-head">
        <span className="emoji">{emoji}</span>
        <span className="qlabel">{label}</span>
      </div>
      <div className="qcount">{fmtNum(count)}</div>
      <div className="qrev">{fmtMoney(revenue, market)}</div>
      <div className="qdesc">{desc}</div>
    </div>
  );
}

function ProductCell({ row }: { row: Row }) {
  return (
    <td className="product">
      <div className="name">{row.n}</div>
      <div className="sku">{row.s}</div>
    </td>
  );
}

function ProductionCell({ row }: { row: Row }) {
  const o = origins(row);
  const items: { label: string; cls: string }[] = [];
  if (o.estoque) items.push({ label: 'ESTOQUE', cls: 'st-green' });
  if (o.ondemand) items.push({ label: 'ON-DEMAND', cls: 'st-purple' });
  if (o.frombatch) items.push({ label: 'FROM-BATCH', cls: 'st-orange' });
  if (items.length === 0) return <td><span style={{ color: 'var(--inv-ink-4)' }}>—</span></td>;
  return (
    <td>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map(it => (
          <span key={it.label} className={`status-badge ${it.cls}`} style={{ fontSize: 9, padding: '2px 8px', alignSelf: 'flex-start' }}>{it.label}</span>
        ))}
      </div>
    </td>
  );
}

function CoverageBadge({ cov }: { cov: number | null }) {
  if (cov == null) return <span style={{ color: 'var(--inv-ink-4)' }}>—</span>;
  const cls = cov <= 14 ? 'st-red' : cov <= 45 ? 'st-gold' : cov <= 120 ? 'st-green' : 'st-gray';
  return <span className={`status-badge ${cls}`}>{Math.round(cov)}d</span>;
}

function RemessaInfo({ qty, when, po, tone }: {
  qty: number;
  when?: string | null | undefined;
  po?: string | null | undefined;
  tone?: 'orange' | 'gold';
}) {
  if (!qty) return <span style={{ color: 'var(--inv-ink-4)' }}>—</span>;
  const color = tone === 'gold' ? 'var(--inv-gold)' : 'var(--inv-orange)';
  // POs concatenadas vêm como "0000023262,0000023275,0000023320" do API
  const poList = (po || '').split(',').map(p => p.trim()).filter(Boolean);
  const visible = poList.slice(0, 2);
  const extra = poList.length - visible.length;
  return (
    <div style={{ textAlign: 'right', minWidth: 110 }}>
      <div style={{ fontWeight: 800, color, fontSize: 13, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmtNum(qty)}</div>
      {when && <div style={{ fontSize: 10, color: 'var(--inv-ink-3)', marginTop: 2 }}>{fmtDate(when)}</div>}
      {visible.length > 0 && (
        <div style={{ fontSize: 8.5, color: 'var(--inv-ink-4)', marginTop: 2, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
          {visible.join(', ')}{extra > 0 ? ` +${extra}` : ''}
        </div>
      )}
    </div>
  );
}

function VariantsModal({ sku, name, variants, loading, error, onClose }: {
  sku: string;
  name: string;
  variants: VariantRow[] | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  // Total agregado
  const totals = (variants || []).reduce(
    (acc, v) => ({
      inStock: acc.inStock + (v.inStock || 0),
      onDemand: acc.onDemand + (v.onDemand || 0),
      fromBatch: acc.fromBatch + (v.fromBatch || 0),
      total: acc.total + (v.total || 0),
    }),
    { inStock: 0, onDemand: 0, fromBatch: 0, total: 0 }
  );

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal-card" onClick={e => e.stopPropagation()}>
        <button className="inv-modal-close" onClick={onClose} aria-label="Fechar">×</button>

        <div className="inv-modal-label">ESTOQUE POR TAMANHO</div>
        <h2 className="inv-modal-title">{name}</h2>
        <div className="inv-modal-sku">{sku}</div>

        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--inv-ink-3)', fontWeight: 600 }}>
            ⏳ Carregando variantes…
          </div>
        )}

        {error && (
          <div style={{
            padding: '16px 18px', background: 'var(--inv-red-soft)',
            color: 'var(--inv-red)', borderRadius: 12, fontSize: 13, fontWeight: 600,
            marginTop: 16,
          }}>
            ⚠️ Não foi possível carregar as variantes: {error}
          </div>
        )}

        {!loading && !error && variants && variants.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--inv-ink-3)' }}>
            Nenhuma variante encontrada para este SKU.
          </div>
        )}

        {!loading && !error && variants && variants.length > 0 && (
          <div className="inv-modal-table-wrap">
            <table className="inv-modal-table">
              <thead>
                <tr>
                  <th>TAMANHO</th>
                  <th className="num" style={{ color: 'var(--inv-green)' }}>EM ESTOQUE</th>
                  <th className="num" style={{ color: 'var(--inv-purple)' }}>ON-DEMAND</th>
                  <th className="num" style={{ color: 'var(--inv-orange)' }}>FROM-BATCH</th>
                  <th className="num">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {variants.map(v => (
                  <tr key={v.sku}>
                    <td className="size">{v.size || '—'}</td>
                    <td className="num" style={{ color: 'var(--inv-green)', fontWeight: 700 }}>
                      {v.inStock > 0 ? fmtNum(v.inStock) : <span style={{ color: 'var(--inv-ink-4)', fontWeight: 400 }}>—</span>}
                    </td>
                    <td className="num" style={{ color: 'var(--inv-purple)', fontWeight: 700 }}>
                      {v.onDemand > 0 ? fmtNum(v.onDemand) : <span style={{ color: 'var(--inv-ink-4)', fontWeight: 400 }}>—</span>}
                    </td>
                    <td className="num" style={{ color: 'var(--inv-orange)', fontWeight: 700 }}>
                      {v.fromBatch > 0 ? fmtNum(v.fromBatch) : <span style={{ color: 'var(--inv-ink-4)', fontWeight: 400 }}>—</span>}
                    </td>
                    <td className="num total">{fmtNum(v.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="size">TOTAL</td>
                  <td className="num" style={{ color: 'var(--inv-green)' }}>{fmtNum(totals.inStock)}</td>
                  <td className="num" style={{ color: 'var(--inv-purple)' }}>{fmtNum(totals.onDemand)}</td>
                  <td className="num" style={{ color: 'var(--inv-orange)' }}>{fmtNum(totals.fromBatch)}</td>
                  <td className="num total">{fmtNum(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Paginator({ page, totalPages, total, setPage }: {
  page: number; totalPages: number; total: number;
  setPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>‹ Anterior</button>
      <span className="pg-info">
        Página <b>{page}</b> de <b>{totalPages}</b> · {total} no total
      </span>
      <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Próxima ›</button>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusClass }) {
  const map: Record<StatusClass, { label: string; cls: string }> = {
    all: { label: '—', cls: 'st-gray' },
    produzir: { label: '🟢 Produzir', cls: 'st-green' },
    stockout: { label: '⚠️ Stockout', cls: 'st-red' },
    manter: { label: '🔵 Manter', cls: 'st-blue' },
    avaliar: { label: '🟡 Avaliar', cls: 'st-gold' },
    encalhe: { label: '🔴 Encalhe', cls: 'st-red' },
    margemneg: { label: '💸 Marg. neg.', cls: 'st-red' },
    reduzir: { label: '⛔ Reduzir', cls: 'st-gray' },
    inativo: { label: '💤 Inativo', cls: 'st-gray' },
  };
  const s = map[status];
  return <span className={`status-badge ${s.cls}`}>{s.label}</span>;
}

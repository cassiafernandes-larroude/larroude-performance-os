'use client';
// Cassia 2026-06-14: clone interno de larroude-inventory-dashboard.vercel.app
// Consome /api/inventory/[market] e renderiza tabela com filtros, busca, KPIs.

import { useEffect, useMemo, useState } from 'react';

type Market = 'US' | 'BR';

interface InventoryRow {
  s: string;           // SKU mãe
  n: string;           // nome
  m: string;           // method (from_batch / from_variant)
  // Vendas por período: r = revenue, q = quantity, c = cost, p = profit, pq = profit qty
  r7?: number; q7?: number; c7?: number; p7?: number; p7q?: number;
  r14?: number; q14?: number; c14?: number; p14?: number; p14q?: number;
  r28?: number; q28?: number; c28?: number; p28?: number; p28q?: number;
  r3?: number; q3?: number; c3?: number; p3?: number; p3q?: number;     // 3M
  r6?: number; q6?: number; c6?: number; p6?: number; p6q?: number;     // 6M
  r12?: number; q12?: number; c12?: number; p12?: number; p12q?: number; // 12M
  q60?: number;        // qty 60d
  e?: number;          // estoque atual
  eo?: number;         // estoque outro depósito
  eb?: number;         // estoque batch/lote
  r?: number;          // received
  t?: number;          // in transit
  rp?: string | null;  // recent purchase date
  tp?: string | null;  // target purchase date
  rnum?: string;       // PO numbers received
  tnum?: string;       // PO numbers transit
  ap?: number;         // avg price
}

interface InventoryData {
  market: string;
  count: number;
  generatedAt: string;
  rows: InventoryRow[];
}

type SortKey = 'r28' | 'q28' | 'q60' | 'e' | 'eb' | 'r12' | 's' | 'n' | 'runway28';

function fmtMoney(v: number | undefined, market: Market): string {
  if (v == null || isNaN(v)) return '—';
  if (market === 'BR') return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  return `$${(v / 1000).toFixed(1)}K`;
}
function fmtNum(v: number | undefined): string {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('en-US');
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function runway(stock: number | undefined, qtyDays: number | undefined, days: number): number | null {
  if (!stock || !qtyDays) return null;
  const dailyRate = qtyDays / days;
  if (dailyRate <= 0) return null;
  return Math.round(stock / dailyRate);
}

export default function InventoryDashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('r28');
  const [sortDesc, setSortDesc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'critical' | 'ok'>('all');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/inventory/${market}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [market]);

  // Filtragem + ordenação
  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows.slice();
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(x =>
        (x.s || '').toLowerCase().includes(q) ||
        (x.n || '').toLowerCase().includes(q),
      );
    }
    if (statusFilter !== 'all') {
      r = r.filter(x => {
        const rn = runway(x.e, x.q28, 28);
        if (rn == null) return statusFilter === 'all';
        if (statusFilter === 'critical') return rn <= 14;
        if (statusFilter === 'low') return rn > 14 && rn <= 45;
        if (statusFilter === 'ok') return rn > 45;
        return true;
      });
    }
    r.sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 's' || sortKey === 'n') {
        va = (a[sortKey] || '').toString();
        vb = (b[sortKey] || '').toString();
        return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
      }
      if (sortKey === 'runway28') {
        va = runway(a.e, a.q28, 28) ?? Infinity;
        vb = runway(b.e, b.q28, 28) ?? Infinity;
      } else {
        va = (a as any)[sortKey] ?? 0;
        vb = (b as any)[sortKey] ?? 0;
      }
      return sortDesc ? (vb - va) : (va - vb);
    });
    return r;
  }, [data, search, sortKey, sortDesc, statusFilter]);

  const totals = useMemo(() => {
    if (!data) return null;
    const t = data.rows.reduce((acc, r) => {
      acc.r28 += r.r28 || 0;
      acc.q28 += r.q28 || 0;
      acc.e += r.e || 0;
      acc.eb += r.eb || 0;
      acc.t += r.t || 0;
      const rn = runway(r.e, r.q28, 28);
      if (rn != null && rn <= 14) acc.critical += 1;
      else if (rn != null && rn <= 45) acc.low += 1;
      return acc;
    }, { r28: 0, q28: 0, e: 0, eb: 0, t: 0, critical: 0, low: 0 });
    return t;
  }, [data]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDesc(d => !d);
    else { setSortKey(k); setSortDesc(true); }
  }

  return (
    <div className="main-dashboard-root px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: 'var(--ink)' }}>Inventory Intelligence</h1>
          <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: 'var(--ink-soft)' }}>
            Decisão de produção com base em venda real, custo e estoque atual.
          </p>
          {data && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-muted)' }}>
              {data.count} SKUs · gerado em {new Date(data.generatedAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(['US', 'BR'] as Market[]).map(m => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className="inline-flex items-center justify-center rounded-full px-3 sm:px-4 py-1.5 text-[12px] sm:text-[13px] font-semibold transition-colors"
              style={{
                background: market === m ? '#ec4899' : '#ebe9e3',
                color: market === m ? 'white' : '#1a1a1a',
              }}
            >
              <span className="text-[10px] font-bold opacity-70 mr-1.5">{m}</span>
              {m === 'US' ? 'United States' : 'Brazil'}
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="pill pill-pink px-3 py-1.5 text-[12px] font-medium"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Carregando…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm mb-4">
          Erro: {error}
        </div>
      )}

      {/* KPIs */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <Kpi label="Revenue 28d" value={fmtMoney(totals.r28, market)} />
          <Kpi label="Units 28d" value={fmtNum(totals.q28)} />
          <Kpi label="Stock atual" value={fmtNum(totals.e)} hint="Em loja/site" />
          <Kpi label="Em trânsito" value={fmtNum(totals.t)} hint="POs a chegar" />
          <Kpi label="Críticos" value={`${totals.critical} SKUs`} hint="Runway ≤ 14d" tone="negative" />
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por SKU ou nome…"
            className="rounded-full px-4 py-2 text-[13px] bg-white font-medium flex-1 min-w-[200px]"
            style={{ border: '1px solid var(--border)' }}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { id: 'all', label: 'Todos' },
              { id: 'critical', label: '🔴 Crítico (≤14d)' },
              { id: 'low', label: '🟠 Baixo (15-45d)' },
              { id: 'ok', label: '🟢 OK (>45d)' },
            ] as const).map(s => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
                style={{
                  background: statusFilter === s.id ? 'var(--pink-deep)' : 'var(--paper)',
                  color: statusFilter === s.id ? 'white' : 'var(--ink-soft)',
                  border: '1px solid var(--border)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-x-auto">
        <table className="w-full text-[11px] min-w-[1100px]">
          <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
            <tr>
              <SortHeader label="SKU" k="s" current={sortKey} desc={sortDesc} onClick={toggleSort} align="left" />
              <SortHeader label="Produto" k="n" current={sortKey} desc={sortDesc} onClick={toggleSort} align="left" />
              <SortHeader label="Q 60d" k="q60" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <SortHeader label="Q 28d" k="q28" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <SortHeader label="Rev 28d" k="r28" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <SortHeader label="Estoque" k="e" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <SortHeader label="Batch" k="eb" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <SortHeader label="Runway" k="runway28" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <th className="text-right px-2 py-1.5">Em trânsito</th>
              <th className="text-left px-2 py-1.5">Próx. chegada</th>
              <SortHeader label="Rev 12M" k="r12" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr><td colSpan={11} className="px-2 py-6 text-center" style={{ color: 'var(--ink-muted)' }}>Nenhum SKU encontrado.</td></tr>
            )}
            {rows.slice(0, 500).map(r => {
              const rn = runway(r.e, r.q28, 28);
              const runwayColor = rn == null ? 'var(--ink-muted)' : rn <= 14 ? '#dc2626' : rn <= 45 ? '#f59e0b' : '#10b981';
              return (
                <tr key={r.s} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-2 py-1.5 font-mono font-semibold text-[10px]" style={{ color: 'var(--pink-deep)' }}>{r.s}</td>
                  <td className="px-2 py-1.5 max-w-[240px] truncate" style={{ color: 'var(--ink)' }} title={r.n}>{r.n}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(r.q60)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtNum(r.q28)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.r28, market)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtNum(r.e)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--ink-muted)' }}>{fmtNum(r.eb)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold" style={{ color: runwayColor }}>
                    {rn != null ? `${rn}d` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(r.t)}</td>
                  <td className="px-2 py-1.5 text-[10px]" style={{ color: 'var(--ink-soft)' }} title={r.tnum || ''}>
                    {fmtDate(r.tp)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.r12, market)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 500 && (
          <div className="text-[10px] mt-2 text-center" style={{ color: 'var(--ink-muted)' }}>
            Mostrando 500 de {rows.length} SKUs. Use a busca pra refinar.
          </div>
        )}
      </div>

      <div className="text-[10px] italic mt-3" style={{ color: 'var(--ink-muted)' }}>
        Runway = stock atual / vendas médias diárias (28d). Crítico ≤ 14d (vermelho), Baixo 15-45d (laranja), OK &gt; 45d (verde).
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'negative' }) {
  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--ink-soft)' }}>{label}</div>
      <div className="font-num text-[18px] lg:text-[20px] font-bold mt-1" style={{ color: tone === 'negative' ? '#dc2626' : 'var(--ink)' }}>
        {value}
      </div>
      {hint && <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{hint}</div>}
    </div>
  );
}

function SortHeader({ label, k, current, desc, onClick, align }: {
  label: string;
  k: SortKey;
  current: SortKey;
  desc: boolean;
  onClick: (k: SortKey) => void;
  align: 'left' | 'right';
}) {
  const isActive = current === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`px-2 py-1.5 cursor-pointer select-none hover:opacity-70 ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: isActive ? 'var(--pink-deep)' : undefined }}
    >
      {label} {isActive && (desc ? '↓' : '↑')}
    </th>
  );
}

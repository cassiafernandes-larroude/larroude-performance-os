'use client';
// Cassia 2026-06-21: Aba Clientes — visão 360° (DTC). Consome /api/clientes/[market].
// Self-contained (Tailwind + .card global), responsivo. Nunca exibe dado inventado:
// se available=false, mostra banner de indisponível.

import { useEffect, useMemo, useState } from 'react';

type Market = 'US' | 'BR';
type PeriodKey = '28d' | '3M' | '6M' | '12M';

interface CustRow {
  customerId: string; name: string; emailMasked: string | null;
  orders: number; revenue: number; aov: number;
  firstOrder: string | null; lastOrder: string | null; isReturning: boolean;
}
interface OpenRow {
  customerId: string; name: string; emailMasked: string | null;
  openOrders: number; openValue: number; oldestDays: number;
}
interface Bundle {
  available: boolean; market: Market; start: string; end: string; currency: string;
  kpis: any; retention: any; newVsReturning: any;
  monthly: Array<{ month: string; customers: number; newCustomers: number; returningCustomers: number }>;
  customers: CustRow[];
  openOrders: { totalOpenOrders: number; totalOpenValue: number; customersWithOpen: number; currency: string; byCustomer: OpenRow[] };
  cohorts: Array<{ cohort: string; size: number; offsets: number[] }>;
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '28d', label: '28D' }, { key: '3M', label: '3M' }, { key: '6M', label: '6M' }, { key: '12M', label: '12M' },
];

function rangeFor(key: PeriodKey): { start: string; end: string } {
  const DAY = 86400000;
  const end = new Date(Date.now() - DAY); // ontem
  const days = key === '28d' ? 28 : key === '3M' ? 90 : key === '6M' ? 180 : 365;
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function fmtMoney(v: number, cur: string, compact = false): string {
  if (!isFinite(v)) v = 0;
  try {
    return new Intl.NumberFormat(cur === 'BRL' ? 'pt-BR' : 'en-US', {
      style: 'currency', currency: cur, notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
    }).format(v);
  } catch { return String(Math.round(v)); }
}
const fmtNum = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v || 0));
const fmtDec = (v: number, d = 1) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number) => `${fmtDec(v)}%`;

export default function ClientesDashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodKey>('12M');
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('clientes:mkt') : null;
    if (saved === 'US' || saved === 'BR') setMarket(saved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = rangeFor(period);
    setLoading(true); setErr(null);
    fetch(`/api/clientes/${market}?start=${start}&end=${end}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Bundle) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [market, period]);

  const cur = data?.currency ?? (market === 'US' ? 'USD' : 'BRL');

  const filteredCustomers = useMemo(() => {
    const list = data?.customers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q) || (c.emailMasked ?? '').toLowerCase().includes(q));
  }, [data, query]);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: 'var(--ink)' }}>Clientes</h1>
          <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: 'var(--ink-soft)' }}>
            Visão 360° — recorrência, novos × recorrentes, LTV, pedidos em aberto, melhores clientes. DTC only.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['US', 'BR'] as Market[]).map((m) => (
              <button key={m} onClick={() => { setMarket(m); try { window.localStorage.setItem('clientes:mkt', m); } catch {} }}
                className="px-3 py-1.5 text-[12px] font-semibold"
                style={{ background: market === m ? 'var(--pink-deep)' : 'transparent', color: market === m ? 'white' : 'var(--ink-soft)' }}>
                {m === 'US' ? '🇺🇸 US' : '🇧🇷 BR'}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className="px-3 py-1.5 text-[12px] font-semibold"
                style={{ background: period === p.key ? 'var(--ink)' : 'transparent', color: period === p.key ? 'white' : 'var(--ink-soft)' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="card text-center py-8" style={{ color: 'var(--ink-soft)' }}>Carregando clientes…</div>}
      {err && <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm">Erro: {err}</div>}

      {data && !data.available && (
        <div className="card" style={{ background: 'rgba(255,92,108,0.10)', border: '1px solid rgba(255,92,108,0.35)', color: '#c0334a' }}>
          <strong>Dados indisponíveis.</strong> A fonte (BigQuery) não respondeu — nenhum número foi exibido. Nada foi estimado.
        </div>
      )}

      {data && data.available && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
            <Kpi label="Clientes" value={fmtNum(data.kpis.totalCustomers)} hint="compradores DTC no período" />
            <Kpi label="% Recorrentes" value={fmtPct(data.kpis.returningCustomerRate)} hint="≥2 compras na janela" color="#5d4ec5" />
            <Kpi label="LTV preditivo" value={fmtMoney(data.kpis.ltvPredictive, cur)} hint="AOV × freq × lifetime" color="#10b981" />
            <Kpi label="AOV" value={fmtMoney(data.kpis.aov, cur)} />
            <Kpi label="Frequência" value={`${fmtDec(data.kpis.purchaseFrequency, 2)}×`} hint="pedidos / cliente" />
            <Kpi label="Receita" value={fmtMoney(data.kpis.totalRevenue, cur, true)} />
          </div>

          {/* Novos x Recorrentes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--ink)' }}>Novos × Recorrentes (período)</h3>
              <NewVsReturning nvr={data.newVsReturning} cur={cur} />
            </div>
            <div className="card">
              <h3 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--ink)' }}>Recorrência & retenção</h3>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <Stat label="Voltam a comprar (vida toda)" value={fmtPct(data.retention.returningRateAllTime)} />
                <Stat label="2ª compra em 90d" value={fmtPct(data.retention.repeat90d)} />
                <Stat label="2ª compra em 12m" value={fmtPct(data.retention.repeat12m)} />
                <Stat label="Mediana dias 1ª→2ª" value={`${fmtNum(data.kpis.medianDaysBetweenPurchases)} dias`} />
                <Stat label="Frequência anual" value={`${fmtDec(data.retention.purchaseFrequencyAnnual, 2)}×`} />
                <Stat label="LTV mediano" value={fmtMoney(data.kpis.ltvMedian, cur)} />
              </div>
            </div>
          </div>

          {/* Tendência mensal novos x recorrentes */}
          {data.monthly.length > 0 && (
            <div className="card">
              <h3 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--ink)' }}>Clientes por mês — novos vs recorrentes</h3>
              <MonthlyBars rows={data.monthly} />
            </div>
          )}

          {/* Melhores clientes */}
          <div className="card">
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Melhores clientes</h3>
            <p className="text-[11px] mb-3" style={{ color: 'var(--ink-soft)' }}>Top por receita no período. Email mascarado por privacidade.</p>
            <CustomerTable rows={data.customers.slice(0, 20)} cur={cur} market={market} />
          </div>

          {/* Pedidos em aberto */}
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>Pedidos em aberto (não enviados)</h3>
              <div className="flex gap-2 lg:gap-3 text-[11px]">
                <Stat label="Pedidos" value={fmtNum(data.openOrders.totalOpenOrders)} />
                <Stat label="Valor" value={fmtMoney(data.openOrders.totalOpenValue, cur, true)} color="#f59e0b" />
                <Stat label="Clientes" value={fmtNum(data.openOrders.customersWithOpen)} />
              </div>
            </div>
            <OpenOrdersTable rows={data.openOrders.byCustomer} cur={cur} />
          </div>

          {/* Cohorts */}
          {data.cohorts.length > 0 && (
            <div className="card overflow-x-auto">
              <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Cohorts de retenção</h3>
              <p className="text-[11px] mb-3" style={{ color: 'var(--ink-soft)' }}>% da safra (mês da 1ª compra) que voltou a comprar em cada mês seguinte.</p>
              <CohortHeatmap cohorts={data.cohorts} />
            </div>
          )}

          {/* Lista pesquisável */}
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>Clientes — LTV individual <span className="text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>(top {fmtNum(data.customers.length)} por receita)</span></h3>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nome / email…"
                className="text-[12px] px-3 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--ink)', minWidth: 200 }} />
            </div>
            <CustomerTable rows={filteredCustomers.slice(0, 100)} cur={cur} market={market} showRank={false} />
            {filteredCustomers.length > 100 && <p className="text-[11px] mt-2" style={{ color: 'var(--ink-muted)' }}>Mostrando 100 de {fmtNum(filteredCustomers.length)} — refine a busca.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</div>
      <div className="font-num font-bold text-[18px] lg:text-[20px] mt-0.5" style={{ color: color ?? 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {hint && <div className="text-[9px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{hint}</div>}
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'var(--paper)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</div>
      <div className="font-num font-bold text-[13px] mt-0.5" style={{ color: color ?? 'var(--ink)' }}>{value}</div>
    </div>
  );
}

function NewVsReturning({ nvr, cur }: { nvr: any; cur: string }) {
  const totalC = (nvr.newCustomers || 0) + (nvr.returningCustomers || 0);
  const newPct = totalC > 0 ? (nvr.newCustomers / totalC) * 100 : 0;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden mb-3" style={{ background: 'var(--border)' }}>
        <div style={{ width: `${newPct}%`, background: '#5d4ec5' }} />
        <div style={{ width: `${100 - newPct}%`, background: '#10b981' }} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <div className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: '#5d4ec5' }} /><span style={{ color: 'var(--ink-soft)' }}>Novos</span></div>
          <div className="font-num font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{fmtNum(nvr.newCustomers)}</div>
          <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{fmtMoney(nvr.newRevenue, cur, true)} · {fmtNum(nvr.newOrders)} pedidos</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: '#10b981' }} /><span style={{ color: 'var(--ink-soft)' }}>Recorrentes</span></div>
          <div className="font-num font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{fmtNum(nvr.returningCustomers)}</div>
          <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{fmtMoney(nvr.returningRevenue, cur, true)} · {fmtNum(nvr.returningOrders)} pedidos</div>
        </div>
      </div>
    </div>
  );
}

function MonthlyBars({ rows }: { rows: Array<{ month: string; newCustomers: number; returningCustomers: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.newCustomers + r.returningCustomers));
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="flex items-end gap-1.5" style={{ minWidth: rows.length * 26, height: 140 }}>
        {rows.map((r) => {
          const total = r.newCustomers + r.returningCustomers;
          const h = (total / max) * 120;
          const newH = total > 0 ? (r.newCustomers / total) * h : 0;
          return (
            <div key={r.month} className="flex flex-col items-center gap-1" style={{ flex: '1 0 22px' }} title={`${r.month}: ${total} clientes (${r.newCustomers} novos)`}>
              <div className="w-full rounded-t flex flex-col justify-end" style={{ height: 120 }}>
                <div style={{ height: total > 0 ? h - newH : 0, background: '#10b981' }} />
                <div style={{ height: newH, background: '#5d4ec5' }} />
              </div>
              <div className="text-[8px]" style={{ color: 'var(--ink-muted)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>{r.month.slice(2)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2 text-[10px]" style={{ color: 'var(--ink-soft)' }}>
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, background: '#5d4ec5' }} />Novos</span>
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, background: '#10b981' }} />Recorrentes</span>
      </div>
    </div>
  );
}

interface OrderDetail { name: string; date: string | null; value: number; mediaOrigin: string; fulfillment: string; financial: string | null; }

const ORIGIN_COLORS: Record<string, string> = {
  'Meta Ads': '#1877f2', 'Google Ads': '#ea4335', 'Klaviyo': '#5d4ec5', 'SMS (Attentive)': '#a855f7',
  'Email': '#0ea5e9', 'Awin': '#f59e0b', 'ShopMy': '#ec4899', 'Agent.shop': '#14b8a6', 'Criteo': '#f97316',
  'Orgânico (Search)': '#10b981', 'Orgânico (Social)': '#22c55e', 'Direto / Sem UTM': '#6b7280', 'Outros': '#9ca3af',
};
function fulfillmentLabel(f: string): { label: string; color: string; bg: string } {
  if (f === 'fulfilled') return { label: 'Enviado', color: '#0d9488', bg: 'rgba(16,185,129,0.14)' };
  if (f === 'partial') return { label: 'Parcial', color: '#b45309', bg: 'rgba(245,158,11,0.16)' };
  return { label: 'Não enviado', color: '#b45309', bg: 'rgba(245,158,11,0.16)' };
}

function CustomerTable({ rows, cur, market, showRank = true }: { rows: CustRow[]; cur: string; market: Market; showRank?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [ordersCache, setOrdersCache] = useState<Record<string, OrderDetail[] | 'loading' | 'error'>>({});
  const cols = (showRank ? 7 : 6) + 1; // +1 da coluna de expandir

  function toggle(id: string) {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && ordersCache[id] === undefined) {
      setOrdersCache((p) => ({ ...p, [id]: 'loading' }));
      fetch(`/api/clientes/${market}/orders?customerId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((d) => setOrdersCache((p) => ({ ...p, [id]: (d.orders ?? []) as OrderDetail[] })))
        .catch(() => setOrdersCache((p) => ({ ...p, [id]: 'error' })));
    }
  }

  if (rows.length === 0) return <div className="text-[12px] py-4 text-center" style={{ color: 'var(--ink-muted)' }}>Nenhum cliente.</div>;
  return (
    <div className="overflow-x-auto -mx-3 sm:mx-0">
      <table className="w-full text-[11px] sm:text-[12px] min-w-[680px]">
        <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
          <tr>
            {showRank && <th className="text-left px-2 py-1.5" style={{ width: 36 }}>#</th>}
            <th className="text-left px-2 py-1.5">Cliente</th>
            <th className="text-right px-2 py-1.5">Pedidos</th>
            <th className="text-right px-2 py-1.5">LTV (período)</th>
            <th className="text-right px-2 py-1.5">AOV</th>
            <th className="text-left px-2 py-1.5">1ª compra</th>
            <th className="text-left px-2 py-1.5">Tipo</th>
            <th className="px-2 py-1.5" style={{ width: 28 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const isOpen = open === c.customerId;
            const detail = ordersCache[c.customerId];
            return (
              <>
                <tr key={c.customerId} className="border-t cursor-pointer" style={{ borderColor: 'var(--border)', background: isOpen ? 'var(--paper)' : undefined }} onClick={() => toggle(c.customerId)}>
                  {showRank && <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: 'var(--ink-muted)' }}>{i + 1}</td>}
                  <td className="px-2 py-1.5">
                    <div className="font-semibold" style={{ color: 'var(--ink)' }} data-no-translate="true">{c.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }} data-no-translate="true">{c.emailMasked ?? '—'}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(c.orders)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtMoney(c.revenue, cur)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(c.aov, cur)}</td>
                  <td className="px-2 py-1.5 text-[10px]" style={{ color: 'var(--ink-soft)' }}>{c.firstOrder ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c.isReturning ? 'rgba(16,185,129,0.14)' : 'rgba(93,78,197,0.14)', color: c.isReturning ? '#0d9488' : '#5d4ec5' }}>
                      {c.isReturning ? 'Recorrente' : 'Novo'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center" style={{ color: 'var(--ink-muted)' }}>{isOpen ? '▾' : '▸'}</td>
                </tr>
                {isOpen && (
                  <tr key={`${c.customerId}-d`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={cols} className="px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--ink-muted)' }}>Pedidos de {c.name} — número + origem mídia</div>
                      {detail === 'loading' && <div className="text-[11px] py-2" style={{ color: 'var(--ink-soft)' }}>Carregando pedidos…</div>}
                      {detail === 'error' && <div className="text-[11px] py-2 text-rose-600">Falha ao carregar pedidos.</div>}
                      {Array.isArray(detail) && detail.length === 0 && <div className="text-[11px] py-2" style={{ color: 'var(--ink-muted)' }}>Sem pedidos no filtro DTC.</div>}
                      {Array.isArray(detail) && detail.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] min-w-[480px]">
                            <thead style={{ color: 'var(--ink-muted)' }}>
                              <tr>
                                <th className="text-left px-2 py-1">Pedido</th>
                                <th className="text-left px-2 py-1">Data</th>
                                <th className="text-right px-2 py-1">Valor</th>
                                <th className="text-left px-2 py-1">Origem mídia</th>
                                <th className="text-left px-2 py-1">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.map((o, j) => {
                                const ff = fulfillmentLabel(o.fulfillment);
                                const oc = ORIGIN_COLORS[o.mediaOrigin] ?? '#9ca3af';
                                return (
                                  <tr key={`${o.name}-${j}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                    <td className="px-2 py-1 font-mono font-semibold" style={{ color: 'var(--ink)' }} data-no-translate="true">{o.name}</td>
                                    <td className="px-2 py-1" style={{ color: 'var(--ink-soft)' }}>{o.date ?? '—'}</td>
                                    <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(o.value, cur)}</td>
                                    <td className="px-2 py-1">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${oc}22`, color: oc }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 99, background: oc }} />{o.mediaOrigin}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: ff.bg, color: ff.color }}>{ff.label}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpenOrdersTable({ rows, cur }: { rows: OpenRow[]; cur: string }) {
  if (rows.length === 0) return <div className="text-[12px] py-4 text-center" style={{ color: 'var(--ink-muted)' }}>Nenhum pedido em aberto. 🎉</div>;
  return (
    <div className="overflow-x-auto -mx-3 sm:mx-0">
      <table className="w-full text-[11px] sm:text-[12px] min-w-[560px]">
        <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
          <tr>
            <th className="text-left px-2 py-1.5">Cliente</th>
            <th className="text-right px-2 py-1.5">Em aberto</th>
            <th className="text-right px-2 py-1.5">Valor</th>
            <th className="text-right px-2 py-1.5">Mais antigo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.customerId} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-2 py-1.5">
                <div className="font-semibold" style={{ color: 'var(--ink)' }} data-no-translate="true">{c.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }} data-no-translate="true">{c.emailMasked ?? '—'}</div>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(c.openOrders)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtMoney(c.openValue, cur)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: c.oldestDays > 7 ? '#e11d48' : 'var(--ink-soft)' }}>{c.oldestDays}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CohortHeatmap({ cohorts }: { cohorts: Array<{ cohort: string; size: number; offsets: number[] }> }) {
  const maxOff = Math.max(0, ...cohorts.map((c) => c.offsets.length - 1));
  const color = (p: number) => {
    if (p <= 0) return 'transparent';
    const a = Math.min(0.85, 0.12 + (p / 100) * 0.8);
    return `rgba(93,78,197,${a})`;
  };
  return (
    <table className="text-[10px] sm:text-[11px]" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
      <thead>
        <tr>
          <th className="text-left px-2 py-1" style={{ color: 'var(--ink-soft)' }}>Safra</th>
          <th className="text-right px-2 py-1" style={{ color: 'var(--ink-soft)' }}>Clientes</th>
          {Array.from({ length: maxOff + 1 }, (_, k) => (
            <th key={k} className="text-center px-1 py-1" style={{ color: 'var(--ink-muted)', minWidth: 34 }}>M{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((c) => (
          <tr key={c.cohort}>
            <td className="px-2 py-1 font-semibold whitespace-nowrap" style={{ color: 'var(--ink)' }}>{c.cohort}</td>
            <td className="px-2 py-1 text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>{fmtNum(c.size)}</td>
            {Array.from({ length: maxOff + 1 }, (_, k) => {
              const p = c.offsets[k] ?? 0;
              return (
                <td key={k} className="text-center tabular-nums" style={{ background: color(p), color: p > 50 ? 'white' : 'var(--ink-soft)', borderRadius: 4, minWidth: 34, padding: '4px 2px' }}>
                  {k < c.offsets.length ? `${Math.round(p)}` : ''}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

'use client';
// Cassia 2026-06-21: Aba Clientes — visão 360° (DTC). MESMO design system do LTV por Produto
// (Header + PeriodFilter + .section-label + .card-section + .prod-table + KpiCard), renderizado
// dentro de .ltv-root pela página. Consome /api/clientes/[market]. Nunca exibe dado inventado.

import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/ltv-dashboard/Header';
import PeriodFilter, { presetRange, type PeriodState } from '@/components/ltv-dashboard/PeriodFilter';
import KpiCard from '@/components/ltv-dashboard/KpiCard';
import MonthlyChart from '@/components/ltv-dashboard/MonthlyChart';
import LtvCacOverTimeChart from '@/components/ltv-dashboard/LtvCacOverTimeChart';
import type { Market, MonthlyLtvPoint } from '@/lib/ltv-dashboard/queries';
import { formatMoney, formatNumber, formatPercent } from '@/lib/ltv-dashboard/format';

interface CustRow {
  customerId: string; name: string; emailMasked: string | null;
  orders: number; revenue: number; aov: number;
  firstOrder: string | null; lastOrder: string | null; isReturning: boolean;
}
interface OpenRow {
  customerId: string; name: string; emailMasked: string | null;
  openOrders: number; openValue: number; oldestDays: number;
}
interface OrderDetail { name: string; date: string | null; value: number; mediaOrigin: string; fulfillment: string; financial: string | null; }
interface Bundle {
  available: boolean; market: Market; start: string; end: string; currency: string;
  kpis: any; retention: any; newVsReturning: any;
  monthly: Array<{ month: string; customers: number; newCustomers: number; returningCustomers: number }>;
  monthlyLtv: MonthlyLtvPoint[];
  customers: CustRow[];
  openOrders: { totalOpenOrders: number; totalOpenValue: number; customersWithOpen: number; currency: string; byCustomer: OpenRow[] };
  cohorts: Array<{ cohort: string; size: number; offsets: number[] }>;
}

const ORIGIN_COLORS: Record<string, string> = {
  'Meta Ads': '#1877f2', 'Google Ads': '#ea4335', 'Klaviyo': '#5d4ec5', 'SMS (Attentive)': '#a855f7',
  'Email': '#0ea5e9', 'Awin': '#f59e0b', 'ShopMy': '#ec4899', 'Agent.shop': '#14b8a6', 'Criteo': '#f97316',
  'Orgânico (Search)': '#10b981', 'Orgânico (Social)': '#22c55e', 'Direto / Sem UTM': '#6b7280', 'Outros': '#9ca3af',
};
function fulfillmentLabel(f: string): { label: string; color: string } {
  if (f === 'fulfilled') return { label: 'Enviado', color: '#2c7a5b' };
  if (f === 'partial') return { label: 'Parcial', color: '#b45309' };
  return { label: 'Não enviado', color: '#b45309' };
}

export default function ClientesDashboard({ freshness }: { freshness: string }) {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodState>(() =>
    presetRange('12M', freshness || new Date().toISOString().slice(0, 10))
  );
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    fetch(`/api/clientes/${market}?start=${period.start}&end=${period.end}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Bundle) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [market, period.start, period.end]);

  const filteredCustomers = useMemo(() => {
    const list = data?.customers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q) || (c.emailMasked ?? '').toLowerCase().includes(q));
  }, [data, query]);

  const k = data?.kpis;
  const r = data?.retention;
  const nvr = data?.newVsReturning;

  return (
    <main className="page">
      <div className="container">
        <Header
          market={market}
          onMarketChange={setMarket}
          freshness={freshness}
          title="Larroudé · Clientes"
          subtitle={<>Visão 360° — recorrência, novos × recorrentes, LTV, pedidos em aberto e melhores clientes · DTC · Shopify via BigQuery</>}
        />

        <PeriodFilter value={period} onChange={setPeriod} maxDate={freshness || new Date().toISOString().slice(0, 10)} />

        {loading && <div className="card" style={{ padding: 40, textAlign: 'center' }}><span className="spinner" />Carregando clientes…</div>}
        {err && <div className="card" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}><strong>Erro:</strong> {err}</div>}

        {data && !data.available && (
          <div className="card" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}>
            <strong>Dados indisponíveis.</strong> A fonte (BigQuery) não respondeu — nada foi exibido nem estimado.
          </div>
        )}

        {data && data.available && k && (
          <>
            {/* KPIs */}
            <div className="section-label"><span>{'\u{1F465}'}</span><span>Visão geral · {market === 'US' ? 'United States' : 'Brazil'}</span></div>
            <div className="kpi-grid">
              <KpiCard label="Clientes" value={formatNumber(k.totalCustomers, market)} sub="compradores DTC no período" />
              <KpiCard label="% Recorrentes" value={formatPercent(k.returningCustomerRate)} sub="≥2 compras na janela" highlight />
              <KpiCard label="LTV preditivo" value={formatMoney(k.ltvPredictive, market)} sub="AOV × freq × lifetime" />
              <KpiCard label="AOV" value={formatMoney(k.aov, market)} sub="ticket médio" />
              <KpiCard label="Frequência" value={`${(k.purchaseFrequency || 0).toFixed(2)}×`} sub="pedidos / cliente" />
              <KpiCard label="Receita" value={formatMoney(k.totalRevenue, market)} sub="net sales no período" />
            </div>

            {/* Novos x Recorrentes */}
            <div className="section-label"><span>{'\u{1F501}'}</span><span>Novos × Recorrentes · período</span></div>
            <div className="card-section">
              {nvr && <NvR nvr={nvr} market={market} />}
            </div>

            {/* Recorrência & retenção */}
            <div className="section-label"><span>{'\u{1F4C8}'}</span><span>Recorrência & retenção</span></div>
            <div className="kpi-grid">
              <KpiCard label="Voltam a comprar" value={formatPercent(r.returningRateAllTime)} sub="vida toda (≥2 compras)" />
              <KpiCard label="2ª compra em 90d" value={formatPercent(r.repeat90d)} />
              <KpiCard label="2ª compra em 12m" value={formatPercent(r.repeat12m)} />
              <KpiCard label="Dias 1ª→2ª (mediana)" value={`${formatNumber(k.medianDaysBetweenPurchases, market)} d`} />
              <KpiCard label="Frequência anual" value={`${(r.purchaseFrequencyAnnual || 0).toFixed(2)}×`} />
              <KpiCard label="LTV mediano" value={formatMoney(k.ltvMedian, market)} />
            </div>

            {/* LTV detalhado */}
            <div className="section-label"><span>{'\u{1F4B0}'}</span><span>LTV detalhado · {market === 'US' ? 'United States' : 'Brazil'}</span></div>
            <div className="kpi-grid">
              <KpiCard label="Historical LTV" value={formatMoney(k.ltvHistorical, market, true)} sub="net_sales / clientes (incl. devoluções)" />
              <KpiCard label="Customer Lifetime" value={k.customerLifetime > 0 ? `${k.customerLifetime.toFixed(2)} a` : '—'} sub="1 / (1 − % recorrentes) · em anos" />
              <KpiCard label="LTV / CAC" value={k.ltvCacRatio > 0 ? k.ltvCacRatio.toFixed(2) : '—'} sub={k.cac > 0 ? `CAC ${formatMoney(k.cac, market, true)} · saudável ≥ 3` : 'spend Meta+Google indisponível'} highlight />
              <KpiCard label="Median LTV (P50)" value={formatMoney(k.ltvMedian, market, true)} sub="mediana dos clientes" />
              <KpiCard label="LTV P75" value={formatMoney(k.ltvP75, market, true)} sub="top 25% gastam acima" />
              <KpiCard label="LTV P90" value={formatMoney(k.ltvP90, market, true)} sub="top 10% — alto valor" />
            </div>

            {/* Gráficos LTV (rolling 12M, via série mensal) */}
            {data.monthlyLtv && data.monthlyLtv.length > 0 && (
              <>
                <div className="section-label"><span>{'\u{1F4C8}'}</span><span>Monthly LTV + Repeat Rate · rolling 12M</span></div>
                <div className="chart-card">
                  <div className="chart-title"><h3>Monthly LTV + Repeat Rate</h3><span className="meta">histórico via BigQuery</span></div>
                  <div className="chart-area"><MonthlyChart data={data.monthlyLtv} market={market} /></div>
                </div>
                <div className="section-label"><span>{'\u{1F4C9}'}</span><span>LTV / CAC ao longo do tempo · últimos 12 meses</span></div>
                <div className="chart-card">
                  <div className="chart-title"><h3>LTV / CAC overtime</h3><span className="meta">🟢 ≥3x saudável · 🔴 ≤1x breakeven</span></div>
                  <div className="chart-area" style={{ height: 300 }}><LtvCacOverTimeChart data={data.monthlyLtv} market={market} /></div>
                </div>
              </>
            )}

            {/* Tendência mensal */}
            {data.monthly.length > 0 && (
              <>
                <div className="section-label"><span>{'\u{1F4C5}'}</span><span>Clientes por mês · novos vs recorrentes</span></div>
                <div className="card-section"><MonthlyBars rows={data.monthly} /></div>
              </>
            )}

            {/* Melhores clientes */}
            <div className="section-label"><span>{'\u{1F3C6}'}</span><span>Melhores clientes</span></div>
            <div className="card-section">
              <div className="section-head">
                <span className="section-badge" style={{ background: '#d44a8a', color: '#fff' }}>TOP</span>
                <h3>Por receita no período</h3>
                <span className="section-meta">clique para ver os pedidos · email mascarado</span>
              </div>
              <CustomerTable rows={data.customers.slice(0, 20)} market={market} rank />
            </div>

            {/* Pedidos em aberto */}
            <div className="section-label"><span>{'\u{1F4E6}'}</span><span>Pedidos em aberto · não enviados</span></div>
            <div className="card-section">
              <div className="section-head">
                <span className="section-badge" style={{ background: '#b45309', color: '#fff' }}>{formatNumber(data.openOrders.totalOpenOrders, market)}</span>
                <h3>{formatMoney(data.openOrders.totalOpenValue, market)} em {formatNumber(data.openOrders.customersWithOpen, market)} clientes</h3>
              </div>
              <OpenOrdersTable rows={data.openOrders.byCustomer} market={market} />
            </div>

            {/* Cohorts */}
            {data.cohorts.length > 0 && (
              <>
                <div className="section-label"><span>{'\u{1F4CA}'}</span><span>Cohorts de retenção · por safra de aquisição</span></div>
                <div className="card-section">
                  <div className="table-scroll"><CohortHeatmap cohorts={data.cohorts} /></div>
                </div>
              </>
            )}

            {/* Lista pesquisável */}
            <div className="section-label"><span>{'\u{1F50E}'}</span><span>Clientes · LTV individual</span></div>
            <div className="card-section">
              <div className="section-head">
                <span className="section-badge" style={{ background: '#2c7a5b', color: '#fff' }}>{formatNumber(data.customers.length, market)}</span>
                <h3>Top por receita</h3>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nome / email…"
                  className="section-meta" style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', minWidth: 200 }} />
              </div>
              <CustomerTable rows={filteredCustomers.slice(0, 100)} market={market} />
              {filteredCustomers.length > 100 && <p className="section-meta" style={{ marginTop: 8 }}>Mostrando 100 de {formatNumber(filteredCustomers.length, market)} — refine a busca.</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function NvR({ nvr, market }: { nvr: any; market: Market }) {
  const totalC = (nvr.newCustomers || 0) + (nvr.returningCustomers || 0);
  const newPct = totalC > 0 ? (nvr.newCustomers / totalC) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', background: 'var(--bg-deep)', marginBottom: 14 }}>
        <div style={{ width: `${newPct}%`, background: '#d44a8a' }} />
        <div style={{ width: `${100 - newPct}%`, background: '#2c7a5b' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div className="kpi-label" style={{ color: '#d44a8a' }}>● Novos</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{formatNumber(nvr.newCustomers, market)}</div>
          <div className="kpi-sub">{formatMoney(nvr.newRevenue, market)} · {formatNumber(nvr.newOrders, market)} pedidos</div>
        </div>
        <div>
          <div className="kpi-label" style={{ color: '#2c7a5b' }}>● Recorrentes</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{formatNumber(nvr.returningCustomers, market)}</div>
          <div className="kpi-sub">{formatMoney(nvr.returningRevenue, market)} · {formatNumber(nvr.returningOrders, market)} pedidos</div>
        </div>
      </div>
    </div>
  );
}

function MonthlyBars({ rows }: { rows: Array<{ month: string; newCustomers: number; returningCustomers: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.newCustomers + r.returningCustomers));
  return (
    <div className="table-scroll">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, minWidth: rows.length * 30, height: 160 }}>
        {rows.map((r) => {
          const total = r.newCustomers + r.returningCustomers;
          const h = (total / max) * 130;
          const newH = total > 0 ? (r.newCustomers / total) * h : 0;
          return (
            <div key={r.month} style={{ flex: '1 0 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${r.month}: ${total} (${r.newCustomers} novos)`}>
              <div style={{ height: 130, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%' }}>
                <div style={{ height: total > 0 ? h - newH : 0, background: '#2c7a5b', borderRadius: '3px 3px 0 0' }} />
                <div style={{ height: newH, background: '#d44a8a' }} />
              </div>
              <div style={{ fontSize: 8.5, color: 'var(--ink-mute)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>{r.month.slice(2)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--ink-soft)' }}>
        <span>● <span style={{ color: '#d44a8a' }}>Novos</span></span>
        <span>● <span style={{ color: '#2c7a5b' }}>Recorrentes</span></span>
      </div>
    </div>
  );
}

function CustomerTable({ rows, market, rank = false }: { rows: CustRow[]; market: Market; rank?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, OrderDetail[] | 'loading' | 'error'>>({});
  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));
  const cols = (rank ? 1 : 0) + 6;

  function toggle(id: string) {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && cache[id] === undefined) {
      setCache((p) => ({ ...p, [id]: 'loading' }));
      fetch(`/api/clientes/${market}/orders?customerId=${encodeURIComponent(id)}`)
        .then((res) => res.json())
        .then((d) => setCache((p) => ({ ...p, [id]: (d.orders ?? []) as OrderDetail[] })))
        .catch(() => setCache((p) => ({ ...p, [id]: 'error' })));
    }
  }

  if (rows.length === 0) return <p className="section-meta">Nenhum cliente.</p>;
  return (
    <div className="table-scroll">
      <table className="prod-table">
        <thead>
          <tr>
            {rank && <th style={{ width: 32 }}>#</th>}
            <th>Cliente</th>
            <th className="num">Pedidos</th>
            <th className="num">LTV (período)</th>
            <th className="num">AOV</th>
            <th>1ª compra</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const isOpen = open === c.customerId;
            const detail = cache[c.customerId];
            return (
              <>
                <tr key={c.customerId} onClick={() => toggle(c.customerId)} style={{ cursor: 'pointer' }} className={isOpen ? 'row-highlight' : ''}>
                  {rank && <td className="rank-cell">{i + 1}</td>}
                  <td className="name-cell">
                    <div className="prod-name">{c.name} <span style={{ color: 'var(--ink-mute)', fontWeight: 400 }}>{isOpen ? '▾' : '▸'}</span></div>
                    <div className="prod-sku">{c.emailMasked ?? '—'}</div>
                  </td>
                  <td className="num">{formatNumber(c.orders, market)}</td>
                  <td className="num"><span className="bar-cell"><span className="mini-bar"><span className="mini-bar-fill" style={{ width: `${(c.revenue / maxRev) * 100}%`, background: '#2c7a5b' }} /></span><span className="ltv-cell">{formatMoney(c.revenue, market)}</span></span></td>
                  <td className="num">{formatMoney(c.aov, market)}</td>
                  <td style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{c.firstOrder ?? '—'}</td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, color: c.isReturning ? '#2c7a5b' : '#d44a8a' }}>{c.isReturning ? 'Recorrente' : 'Novo'}</span></td>
                </tr>
                {isOpen && (
                  <tr key={`${c.customerId}-d`}>
                    <td colSpan={cols} style={{ background: 'var(--bg-soft)', padding: '10px 14px' }}>
                      <div className="section-meta" style={{ marginBottom: 8 }}>Pedidos de {c.name} — número + origem mídia</div>
                      {detail === 'loading' && <p className="section-meta">Carregando pedidos…</p>}
                      {detail === 'error' && <p style={{ color: '#b3382f', fontSize: 12 }}>Falha ao carregar.</p>}
                      {Array.isArray(detail) && detail.length === 0 && <p className="section-meta">Sem pedidos (filtro DTC, trocas excluídas).</p>}
                      {Array.isArray(detail) && detail.length > 0 && (
                        <table className="prod-table" style={{ background: '#fff', borderRadius: 8 }}>
                          <thead><tr><th>Pedido</th><th>Data</th><th className="num">Valor</th><th>Origem mídia</th><th>Status</th></tr></thead>
                          <tbody>
                            {detail.map((o, j) => {
                              const ff = fulfillmentLabel(o.fulfillment);
                              const oc = ORIGIN_COLORS[o.mediaOrigin] ?? '#9ca3af';
                              return (
                                <tr key={`${o.name}-${j}`}>
                                  <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{o.name}</td>
                                  <td style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{o.date ?? '—'}</td>
                                  <td className="num">{formatMoney(o.value, market)}</td>
                                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: oc }}><span style={{ width: 6, height: 6, borderRadius: 99, background: oc }} />{o.mediaOrigin}</span></td>
                                  <td><span style={{ fontSize: 11, fontWeight: 600, color: ff.color }}>{ff.label}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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

function OpenOrdersTable({ rows, market }: { rows: OpenRow[]; market: Market }) {
  if (rows.length === 0) return <p className="section-meta">Nenhum pedido em aberto. 🎉</p>;
  return (
    <div className="table-scroll">
      <table className="prod-table">
        <thead><tr><th>Cliente</th><th className="num">Em aberto</th><th className="num">Valor</th><th className="num">Mais antigo</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.customerId}>
              <td className="name-cell"><div className="prod-name">{c.name}</div><div className="prod-sku">{c.emailMasked ?? '—'}</div></td>
              <td className="num">{formatNumber(c.openOrders, market)}</td>
              <td className="num ltv-cell">{formatMoney(c.openValue, market)}</td>
              <td className="num" style={{ color: c.oldestDays > 7 ? '#b3382f' : 'var(--ink-soft)' }}>{c.oldestDays} d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CohortHeatmap({ cohorts }: { cohorts: Array<{ cohort: string; size: number; offsets: number[] }> }) {
  const maxOff = Math.max(0, ...cohorts.map((c) => c.offsets.length - 1));
  const color = (p: number) => (p <= 0 ? 'transparent' : `rgba(44,122,91,${Math.min(0.85, 0.12 + (p / 100) * 0.8)})`);
  return (
    <table className="prod-table" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
      <thead>
        <tr>
          <th>Safra</th><th className="num">Clientes</th>
          {Array.from({ length: maxOff + 1 }, (_, j) => <th key={j} className="num" style={{ minWidth: 36 }}>M{j}</th>)}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((c) => (
          <tr key={c.cohort}>
            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.cohort}</td>
            <td className="num">{c.size}</td>
            {Array.from({ length: maxOff + 1 }, (_, j) => {
              const p = c.offsets[j] ?? 0;
              return <td key={j} className="num" style={{ background: color(p), color: p > 50 ? '#fff' : 'var(--ink-soft)', borderRadius: 4 }}>{j < c.offsets.length ? Math.round(p) : ''}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

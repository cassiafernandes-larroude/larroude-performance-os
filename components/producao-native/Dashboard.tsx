'use client';
// Cassia 2026-06-15: clone fiel do larroude-producao-dashboard.vercel.app
// Estrutura do original (validada via inspecao visual + DOM):
//   - Header Larroudé · Produção 2.0
//   - Section 🥇 Visão Geral (parque produtivo + KPIs)
//   - Section 📅 Próximas 8 semanas (cronograma de entregas com volume bar)
//   - Section 📦 Todas as remessas (filtros Status + busca + tabela completa)
// SEM tabs — single-page scroll.

import { useEffect, useMemo, useState } from 'react';

type StatusFilter = 'todas' | 'atrasadas' | 'gargalo' | 'no-prazo';

interface Totals {
  paresPendentes?: number;
  paresBaixados?: number;
  remessasAtivas?: number;
  remessasGargalo?: number;
  remessasBloqueadas?: number;
  remessasAtrasadas?: number;
  leadTimeMedio?: number;
  proximaEntrega?: string | null;
}
interface Fabrica {
  nome_fabrica?: string; remessas?: number; pares_pendentes?: number;
  pares_baixados?: number; avg_lead_time?: number; remessas_em_gargalo?: number;
}
interface Setor {
  nome_setor?: string; sequencia?: number; lotes_no_setor?: number;
  pares_pendentes?: number; avg_dias_no_setor?: number; avg_dias_espera?: number;
  total_em_gargalo?: number;
}
interface Remessa {
  remessa?: string; nome?: string; sku?: string; cod_ref?: string; fabrica?: string;
  pares_pendentes?: number; pares_baixados?: number; pares_totais?: number;
  dt_entrega?: string | null; setor_atual?: string;
  is_bottleneck?: boolean; toc_status?: string | null;
  dias_no_setor?: number; dias_espera_entre_setores?: number;
  lead_time_acumulado_dias?: number;
  status_entrega?: string; dias_para_entrega?: number;
  skus?: number;
}
interface ProducaoData {
  generatedAt?: string; totals?: Totals;
  fabricas?: Fabrica[]; setores?: Setor[]; remessas?: Remessa[];
}

function fmtNum(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}
function fmtDec(v: number | null | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(digits);
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch { return v; }
}
function fmtDateLong(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch { return v; }
}

/** ISO week: 2026-W26 */
function isoWeek(d: Date): { year: number; week: number; key: string } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week, key: `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}` };
}
/** Pega a segunda da semana ISO (yyyy-Www → segunda) */
function mondayOfIsoWeek(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay();
  const ISOweekStart = new Date(simple);
  if (dayOfWeek <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return ISOweekStart;
}

export default function ProducaoDashboard() {
  const [data, setData] = useState<ProducaoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('todas');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/producao');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) || null);
    } catch (e: any) { setError(e?.message || 'erro'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const t = data?.totals || {};

  // Cronograma de 8 semanas — agrupa remessas por semana ISO da dt_entrega.
  const proximas8Semanas = useMemo(() => {
    if (!data?.remessas) return [];
    const buckets = new Map<string, { year: number; week: number; key: string; monday: Date; pares: number; remessas: number }>();
    for (const r of data.remessas) {
      if (!r.dt_entrega) continue;
      const d = new Date(r.dt_entrega.length === 10 ? r.dt_entrega + 'T00:00:00' : r.dt_entrega);
      if (isNaN(d.getTime())) continue;
      const iso = isoWeek(d);
      const monday = mondayOfIsoWeek(iso.year, iso.week);
      const existing = buckets.get(iso.key);
      if (existing) {
        existing.pares += r.pares_pendentes || 0;
        existing.remessas += 1;
      } else {
        buckets.set(iso.key, {
          year: iso.year, week: iso.week, key: iso.key, monday,
          pares: r.pares_pendentes || 0, remessas: 1,
        });
      }
    }
    const today = new Date();
    return Array.from(buckets.values())
      .filter(b => b.monday.getTime() >= today.getTime() - 7 * 86400000)
      .sort((a, b) => a.monday.getTime() - b.monday.getTime())
      .slice(0, 8);
  }, [data]);

  const maxParesSemana = useMemo(
    () => Math.max(1, ...proximas8Semanas.map(s => s.pares)),
    [proximas8Semanas]
  );

  // Filtros + busca na tabela de remessas
  const remessasFiltradas = useMemo(() => {
    if (!data?.remessas) return [];
    let arr = data.remessas;
    if (status === 'atrasadas') {
      arr = arr.filter(r => r.dias_para_entrega != null && r.dias_para_entrega < 0);
    } else if (status === 'gargalo') {
      arr = arr.filter(r => r.is_bottleneck);
    } else if (status === 'no-prazo') {
      arr = arr.filter(r => r.dias_para_entrega == null || r.dias_para_entrega >= 0);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(r =>
        (r.remessa || '').toLowerCase().includes(q) ||
        (r.sku || '').toLowerCase().includes(q) ||
        (r.nome || '').toLowerCase().includes(q) ||
        (r.cod_ref || '').toLowerCase().includes(q) ||
        (r.setor_atual || '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [data, status, search]);

  const totalParesPendentes = useMemo(
    () => (data?.remessas || []).reduce((s, r) => s + (r.pares_pendentes || 0), 0),
    [data]
  );

  return (
    <div className="prod-root">
      <div className="app">

        {/* Header */}
        <header className="mb-4">
          <div className="pt-2 pb-2 flex items-start justify-between gap-4 flex-wrap">
            <h1 className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
                style={{ color: 'var(--p-ink)', letterSpacing: '-0.025em' }}>
              <span>Larroudé</span>
              <span style={{ color: 'var(--p-ink-4)', margin: '0 10px', fontWeight: 400 }}>·</span>
              <span>Produção 2.0</span>
            </h1>
            <button onClick={load} disabled={loading} className="refresh-btn">
              {loading ? '⏳ Carregando…' : '↻ Atualizar'}
            </button>
          </div>
          <p className="subtitle">
            Parque produtivo TOC · <b>LARROUDE FILIAL SAPIRANGA 4 - 1</b> (Senda 4)
            {data?.generatedAt && <> · dados de <b>{fmtDate(data.generatedAt)}</b></>}
            {' · '}<span style={{ color: 'var(--p-ink-3)' }}>BigQuery DM_SUPPLY_CHAIN.fct_remessas_producao</span>
          </p>
        </header>

        {error && (
          <div className="list-card" style={{ background: 'var(--p-red-soft)', padding: '14px 18px', color: 'var(--p-red)', fontWeight: 600, fontSize: 13 }}>
            ⚠️ Erro: {error}
          </div>
        )}

        {loading && !data && <div className="loading-box">⏳ Carregando produção…</div>}

        {data && (
          <>
            {/* ====== 🥇 Visão Geral ====== */}
            <div className="section-head">
              <span className="section-pill sp-gold">🥇 Visão geral</span>
              <span className="title">
                Parque produtivo · <b>{fmtNum(t.remessasAtivas)}</b> remessas ativas
              </span>
            </div>
            <div className="kpi-grid kpi-grid-8">
              <Kpi label="Em Remessa" value={fmtNum(t.paresPendentes)} sub="pares pendentes" />
              <Kpi label="Baixados" value={fmtNum(t.paresBaixados)} sub="produzidos" />
              <Kpi label="Remessas ativas" value={fmtNum(t.remessasAtivas)} />
              <Kpi label="Em Gargalo TOC" value={fmtNum(t.remessasGargalo)} accent="red" />
              <Kpi label="Bloqueadas TOC" value={fmtNum(t.remessasBloqueadas)} accent="red" />
              <Kpi label="Atrasadas" value={fmtNum(t.remessasAtrasadas)} accent="gold" />
              <Kpi label="Lead time médio" value={t.leadTimeMedio != null ? `${fmtDec(t.leadTimeMedio)}d` : '—'} />
              <Kpi label="Próxima entrega" value={fmtDate(t.proximaEntrega)} accent="blue" />
            </div>

            {/* ====== 📅 Próximas 8 semanas ====== */}
            <div className="section-head" style={{ marginTop: 40 }}>
              <span className="section-pill sp-teal">📅 Próximas 8 semanas</span>
              <span className="title">
                Cronograma de entregas — pares programados por semana (Senda 4)
              </span>
            </div>
            <div className="list-card">
              <table className="list-table">
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th>Início (segunda)</th>
                    <th className="num">Pares programados</th>
                    <th className="num">Remessas</th>
                    <th>Volume relativo</th>
                  </tr>
                </thead>
                <tbody>
                  {proximas8Semanas.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--p-ink-3)' }}>Sem remessas com data de entrega futura.</td></tr>
                  ) : proximas8Semanas.map(s => (
                    <tr key={s.key}>
                      <td style={{ fontWeight: 700 }}>{s.key}</td>
                      <td>{fmtDateLong(s.monday.toISOString().slice(0, 10))}</td>
                      <td className="num"><b>{fmtNum(s.pares)}</b></td>
                      <td className="num">{fmtNum(s.remessas)}</td>
                      <td style={{ minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--p-line)', borderRadius: 100, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(s.pares / maxParesSemana) * 100}%`, background: 'var(--p-teal)', borderRadius: 100 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--p-ink)', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>
                            {fmtNum(s.pares)} pares
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ====== 📦 Todas as remessas ====== */}
            <div className="section-head" style={{ marginTop: 40 }}>
              <span className="section-pill sp-blue">📦 Todas as remessas</span>
              <span className="title">
                Lista completa — clique no número para ver os produtos
              </span>
              <span className="right-info">
                <b>{fmtNum(data.remessas?.length || 0)}</b> remessas · <b>{fmtNum(totalParesPendentes)}</b> pares pendentes
              </span>
            </div>

            {/* Filtros */}
            <div className="filter-card">
              <span className="filter-label">STATUS</span>
              <div className="filter-row">
                {([
                  { id: 'todas', label: 'Todas' },
                  { id: 'atrasadas', label: 'Atrasadas' },
                  { id: 'gargalo', label: 'Em Gargalo' },
                  { id: 'no-prazo', label: 'No Prazo' },
                ] as { id: StatusFilter; label: string }[]).map(it => (
                  <button
                    key={it.id}
                    onClick={() => setStatus(it.id)}
                    className={`btn-pill ${status === it.id ? 'active' : ''}`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Buscar por nº de remessa, SKU, produto, setor…"
                className="search-input"
              />
            </div>

            {/* Tabela completa */}
            <div className="list-card">
              <table className="list-table">
                <thead>
                  <tr>
                    <th>Remessa</th>
                    <th>Fábrica</th>
                    <th>Setor atual</th>
                    <th className="num">Pendente</th>
                    <th className="num">Baixados</th>
                    <th className="num">Total</th>
                    <th className="num">SKUs</th>
                    <th>Status TOC</th>
                    <th className="num">Entrega</th>
                    <th className="num">Lead time</th>
                  </tr>
                </thead>
                <tbody>
                  {remessasFiltradas.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--p-ink-3)' }}>Nenhuma remessa encontrada.</td></tr>
                  ) : remessasFiltradas.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700 }}>{r.remessa || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--p-ink-3)' }}>{r.nome || r.cod_ref || '—'}</div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--p-ink-2)' }}>{r.fabrica || '—'}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{r.setor_atual || '—'}</td>
                      <td className="num"><b>{fmtNum(r.pares_pendentes)}</b></td>
                      <td className="num" style={{ color: 'var(--p-ink-3)' }}>{fmtNum(r.pares_baixados)}</td>
                      <td className="num">{fmtNum(r.pares_totais)}</td>
                      <td className="num">{fmtNum(r.skus)}</td>
                      <td>
                        {r.toc_status ? <StatusTocBadge status={r.toc_status} /> : <span style={{ color: 'var(--p-ink-4)', fontSize: 11 }}>—</span>}
                      </td>
                      <td className="num">
                        <div>{fmtDate(r.dt_entrega)}</div>
                        {r.dias_para_entrega != null && r.dias_para_entrega < 0 && (
                          <span className="status-badge st-red" style={{ marginTop: 4, display: 'inline-block' }}>
                            {Math.abs(r.dias_para_entrega)}d atraso
                          </span>
                        )}
                      </td>
                      <td className="num">{r.lead_time_acumulado_dias != null ? `${r.lead_time_acumulado_dias}d` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {remessasFiltradas.length > 200 && (
                <div style={{ padding: 14, textAlign: 'center', color: 'var(--p-ink-3)', fontSize: 11, borderTop: '1px solid var(--p-line)' }}>
                  Mostrando 200 de {fmtNum(remessasFiltradas.length)} · refine os filtros ou busca para ver mais.
                </div>
              )}
            </div>

            <div className="foot">
              Larroudé Produção 2.0 · {data?.generatedAt ? `gerado em ${fmtDate(data.generatedAt)}` : '—'} · DM_SUPPLY_CHAIN.fct_remessas_producao
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================== sub-componentes ============================== */
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'red' | 'green' | 'gold' | 'blue' | 'orange' }) {
  const colorMap: Record<string, string> = {
    red: 'var(--p-red)', green: 'var(--p-green)', gold: 'var(--p-gold)',
    blue: 'var(--p-blue)', orange: 'var(--p-orange)',
  };
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value" style={accent ? { color: colorMap[accent] } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function StatusTocBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s.includes('GARGALO') || s.includes('BLOQUEAD')) {
    return <span className="status-badge st-red">🔥 GARGALO</span>;
  }
  if (s.includes('ATRAS')) {
    return <span className="status-badge st-orange">⚠️ ATRASO</span>;
  }
  return <span className="status-badge st-gray">{status}</span>;
}

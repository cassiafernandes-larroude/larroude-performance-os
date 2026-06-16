'use client';
// Cassia 2026-06-15: clone fiel 1:1 do larroude-producao-dashboard.vercel.app.
// Shape do upstream (validado via inspecao DOM):
//   { generatedAt, totals, fabricas[], setores[], remessasTop[], remessasGargalo[],
//     semanasEntrega[], producaoDiaria[] }
//
// Sections (single-page scroll):
//   1. 🥇 Visão geral (8 KPIs)
//   2. 🏭 Fábricas (tabela performance por fábrica)
//   3. ⏱ Setores (tempo perdido por setor — dentro vs espera)
//   4. 📊 Produção realizada (bar charts diários por setor · Diário/Semanal/Mensal)
//   5. 📅 Próximas 8 semanas (cronograma de entregas)
//   6. 🚨 Risco crítico (remessas atrasadas com pendente > 50)
//   7. 🔥 TOC (remessas em gargalo · top 50 por volume)

import { useEffect, useMemo, useState } from 'react';

type ChartMode = 'diario' | 'semanal' | 'mensal';
type PageTab = 'producao' | 'producao-realizada' | 'remessas' | 'open-orders' | 'demanda' | 'diagnostico';
// Mesmos presets do Main Dashboard (lpos/lib/main-dashboard/periods)
type PeriodKey = '1d' | '7d' | '14d' | '28d' | '3M' | '6M' | '12M' | 'custom';
const PERIOD_LABEL: Record<PeriodKey, string> = {
  '1d': 'D-1', '7d': '7D', '14d': '14D', '28d': '28D',
  '3M': '3M', '6M': '6M', '12M': '12M', 'custom': 'Personalizado',
};
const PERIOD_DAYS: Record<Exclude<PeriodKey, 'custom'>, number> = {
  '1d': 1, '7d': 7, '14d': 14, '28d': 28, '3M': 90, '6M': 180, '12M': 365,
};

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
  nome_fabrica?: string; remessas?: number;
  pares_pendentes?: number; pares_baixados?: number;
  avg_lead_time?: number; remessas_em_gargalo?: number;
}
interface Setor {
  nome_setor?: string; sequencia?: number; lotes_no_setor?: number;
  pares_pendentes?: number; avg_dias_no_setor?: number;
  avg_dias_espera?: number | null; total_em_gargalo?: number;
}
interface Remessa {
  remessa?: string; nome?: string; sku?: string; cod_ref?: string; fabrica?: string;
  pares_pendentes?: number; pares_baixados?: number; pares_totais?: number;
  dt_entrega?: string | null; data_inclusao?: string | null; setor_atual?: string;
  is_bottleneck?: boolean; toc_status?: string | null;
  dias_no_setor?: number; dias_espera_entre_setores?: number;
  dias_sem_movimentacao?: number;
  lead_time_acumulado_dias?: number;
  status_entrega?: string; dias_para_entrega?: number;
}
interface SemanaEntrega { semana?: string; data_inicio?: string; pares?: number; remessas?: number; }
interface ProducaoDia { dia?: string; setor?: string; pares?: number; }

interface ProducaoData {
  generatedAt?: string;
  totals?: Totals;
  fabricas?: Fabrica[];
  setores?: Setor[];
  remessasTop?: Remessa[];
  remessasGargalo?: Remessa[];
  semanasEntrega?: SemanaEntrega[];
  producaoDiaria?: ProducaoDia[];
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
function fmtDateShort(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch { return v; }
}

/* ISO week helpers */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

export default function ProducaoDashboard() {
  const [data, setData] = useState<ProducaoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>('diario');
  // Filtro de período (igual Main Dashboard) — só usado na aba Produção realizada
  const [periodKey, setPeriodKey] = useState<PeriodKey>('28d');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  // Cassia 2026-06-15: nav por abas no topo (Produção / Produção realizada / Remessas / Open Orders / Demanda / Diagnóstico)
  const [pageTab, setPageTab] = useState<PageTab>('producao');
  // Open Orders (lazy load)
  const [openOrders, setOpenOrders] = useState<any | null>(null);
  // Cassia 2026-06-15: busca no bloco Risco Crítico + Modal de detalhe da remessa
  const [searchRisco, setSearchRisco] = useState('');
  const [searchToc, setSearchToc] = useState('');
  const [searchRemessas, setSearchRemessas] = useState('');

  // Lazy load Open Orders quando muda pra aba
  useEffect(() => {
    if (pageTab !== 'open-orders' || openOrders) return;
    fetch('/api/producao/open-orders')
      .then(r => r.ok ? r.json() : null)
      .then(d => setOpenOrders(d || { totals: {}, rows: [] }))
      .catch(() => setOpenOrders({ totals: {}, rows: [] }));
  }, [pageTab, openOrders]);
  const [selectedRemessa, setSelectedRemessa] = useState<Remessa | null>(null);
  const [modalProducts, setModalProducts] = useState<Remessa[] | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Carrega produtos da remessa selecionada
  useEffect(() => {
    if (!selectedRemessa?.remessa) return;
    let cancelled = false;
    setModalLoading(true); setModalProducts(null);
    fetch(`/api/producao/remessas/${encodeURIComponent(selectedRemessa.remessa)}`)
      .then(r => r.ok ? r.json() : { items: [], remessa: null })
      .then(d => {
        if (cancelled) return;
        const items = Array.isArray(d?.items) ? d.items : (Array.isArray(d?.produtos) ? d.produtos : (Array.isArray(d?.skus) ? d.skus : []));
        if (items.length > 0) {
          setModalProducts(items);
        } else {
          // Fallback: filtra localmente todas as linhas com mesmo numero de remessa
          const all = [
            ...(data?.remessas || []),
            ...(data?.remessasTop || []),
            ...(data?.remessasGargalo || []),
          ];
          const seen = new Set<string>();
          const local = all.filter(r => r.remessa === selectedRemessa.remessa && r.sku && !seen.has(r.sku) && seen.add(r.sku));
          setModalProducts(local.length > 0 ? local : [selectedRemessa]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setModalProducts([selectedRemessa]);
      })
      .finally(() => { if (!cancelled) setModalLoading(false); });
    return () => { cancelled = true; };
  }, [selectedRemessa, data]);

  // ESC fecha modal
  useEffect(() => {
    if (!selectedRemessa) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedRemessa(null); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [selectedRemessa]);

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

  // Range de datas baseado no preset
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (periodKey === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    if (periodKey === 'custom') {
      // Sem datas válidas → fallback 28d
      const start = new Date(today); start.setDate(start.getDate() - 28);
      return { start: start.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) };
    }
    const days = PERIOD_DAYS[periodKey];
    const start = new Date(today);
    if (periodKey === '1d') start.setDate(start.getDate() - 1);
    else start.setDate(start.getDate() - days);
    return { start: start.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) };
  }, [periodKey, customStart, customEnd]);

  // Auto-ajusta chartMode conforme periodo: 3M+ = semanal, 12M = mensal
  useEffect(() => {
    if (periodKey === '3M' || periodKey === '6M') setChartMode('semanal');
    else if (periodKey === '12M') setChartMode('mensal');
    else setChartMode('diario');
  }, [periodKey]);

  // Agrupar producaoDiaria por setor → série de barras (filtra pelo range)
  const producaoPorSetor = useMemo(() => {
    if (!data?.producaoDiaria) return [] as Array<{ setor: string; series: Array<{ key: string; pares: number }>; total: number; media: number; pico: number; ultimo?: { key: string; pares: number } }>;
    const bySetor = new Map<string, Map<string, number>>();
    for (const p of data.producaoDiaria) {
      if (!p.setor || !p.dia) continue;
      // Aplica filtro de periodo
      if (p.dia < dateRange.start || p.dia > dateRange.end) continue;
      const d = new Date(p.dia + 'T00:00:00');
      const key = chartMode === 'diario' ? p.dia : chartMode === 'semanal' ? isoWeekKey(d) : monthKey(d);
      if (!bySetor.has(p.setor)) bySetor.set(p.setor, new Map());
      const m = bySetor.get(p.setor)!;
      m.set(key, (m.get(key) || 0) + (p.pares || 0));
    }
    return Array.from(bySetor.entries())
      .map(([setor, m]) => {
        const series = Array.from(m.entries())
          .map(([key, pares]) => ({ key, pares }))
          .sort((a, b) => a.key.localeCompare(b.key));
        const total = series.reduce((s, x) => s + x.pares, 0);
        const media = series.length > 0 ? total / series.length : 0;
        const pico = series.reduce((max, x) => Math.max(max, x.pares), 0);
        const ultimo = series[series.length - 1];
        return { setor, series, total, media, pico, ultimo };
      })
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [data, chartMode, dateRange]);

  // Regra do Main Dashboard: > 14 barras → 1 chart por linha (cards full-width).
  // Aqui adaptado: > 14 barras → 2 colunas (em vez de 3) pra dar espaço aos rótulos.
  const maxBarrasNoSetor = useMemo(
    () => producaoPorSetor.reduce((m, s) => Math.max(m, s.series.length), 0),
    [producaoPorSetor]
  );
  const prodGridCols = maxBarrasNoSetor > 14 ? 2 : 3;

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

          {/* Nav por abas (pills) — Cassia 2026-06-15 */}
          <div className="page-tabs">
            {([
              { id: 'producao', label: '🏭 Produção' },
              { id: 'producao-realizada', label: '📊 Produção realizada' },
              { id: 'remessas', label: '📅 Remessas' },
              { id: 'open-orders', label: '🛍 Open Orders' },
              { id: 'demanda', label: '📈 Demanda' },
              { id: 'diagnostico', label: '🩺 Diagnóstico' },
            ] as { id: PageTab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setPageTab(t.id)}
                className={`page-tab-pill ${pageTab === t.id ? 'active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {error && (
          <div className="list-card" style={{ background: 'var(--p-red-soft)', padding: '14px 18px', color: 'var(--p-red)', fontWeight: 600, fontSize: 13 }}>
            ⚠️ Erro: {error}
          </div>
        )}

        {loading && !data && <div className="loading-box">⏳ Carregando produção…</div>}

        {data && (
          <>
            {/* ====== ABA PRODUÇÃO (default) — Visão geral, Fábricas, Setores, Produção realizada ====== */}
            {pageTab === 'producao' && <>
            {/* ====== 🥇 Visão geral ====== */}
            <div className="section-head">
              <span className="section-pill sp-gold">🥇 Visão geral</span>
              <span className="title">Parque produtivo · <b>{fmtNum(t.remessasAtivas)}</b> remessas ativas</span>
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

            {/* ====== 🏭 Fábricas ====== */}
            {data.fabricas && data.fabricas.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 40 }}>
                  <span className="section-pill sp-teal">🏭 Fábricas</span>
                  <span className="title">Performance por fábrica — todas, ordenadas por pares pendentes</span>
                  <span className="right-info">{data.fabricas.length} fábricas</span>
                </div>
                <div className="list-card">
                  <table className="list-table">
                    <thead>
                      <tr>
                        <th>Fábrica</th>
                        <th className="num">Remessas</th>
                        <th className="num">Pendente</th>
                        <th className="num">Baixados</th>
                        <th className="num">Lead time</th>
                        <th className="num">Gargalo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fabricas
                        .slice()
                        .sort((a, b) => (b.pares_pendentes || 0) - (a.pares_pendentes || 0))
                        .map((f, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{f.nome_fabrica || '—'}</td>
                            <td className="num">{fmtNum(f.remessas)}</td>
                            <td className="num"><b>{fmtNum(f.pares_pendentes)}</b></td>
                            <td className="num" style={{ color: 'var(--p-ink-3)' }}>{fmtNum(f.pares_baixados)}</td>
                            <td className="num">{f.avg_lead_time != null ? `${fmtDec(f.avg_lead_time)}d` : '—'}</td>
                            <td className="num" style={{
                              color: (f.remessas_em_gargalo || 0) > 0 ? 'var(--p-red)' : 'var(--p-ink-3)',
                              fontWeight: (f.remessas_em_gargalo || 0) > 0 ? 800 : 500,
                            }}>
                              {fmtNum(f.remessas_em_gargalo)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ====== ⏱ Setores (tempo perdido) ====== */}
            {data.setores && data.setores.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 40 }}>
                  <span className="section-pill sp-blue">⏱ Setores</span>
                  <span className="title">Tempo perdido por setor — dentro (capacidade) vs espera depois (sequenciamento) · Senda 4</span>
                  <span className="right-info">{data.setores.length} setores</span>
                </div>
                <div className="list-card">
                  <table className="list-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Setor</th>
                        <th className="num">Lotes no setor</th>
                        <th className="num">Pendente</th>
                        <th className="num">Dias dentro</th>
                        <th className="num">Dias espera</th>
                        <th>Tempo perdido (visual)</th>
                        <th className="num">Em gargalo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const maxTotal = Math.max(
                          1,
                          ...data.setores!.map(s => (s.avg_dias_no_setor || 0) + (s.avg_dias_espera || 0))
                        );
                        return data.setores!
                          .slice()
                          .sort((a, b) => (a.sequencia || 0) - (b.sequencia || 0))
                          .map((s, i) => {
                            const dentro = s.avg_dias_no_setor || 0;
                            const espera = s.avg_dias_espera || 0;
                            const total = dentro + espera;
                            return (
                              <tr key={i}>
                                <td className="rank">{s.sequencia ?? '—'}</td>
                                <td style={{ fontWeight: 700 }}>{s.nome_setor || '—'}</td>
                                <td className="num">{fmtNum(s.lotes_no_setor)}</td>
                                <td className="num"><b>{fmtNum(s.pares_pendentes)}</b></td>
                                <td className="num" style={{ color: dentro >= 5 ? 'var(--p-orange)' : 'var(--p-ink)' }}>{fmtDec(dentro)}d</td>
                                <td className="num" style={{ color: espera >= 7 ? 'var(--p-gold)' : 'var(--p-ink-3)' }}>{fmtDec(espera)}d</td>
                                <td style={{ minWidth: 240 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1, height: 8, background: 'var(--p-line)', borderRadius: 100, overflow: 'hidden', display: 'flex' }}>
                                      <div style={{ height: '100%', width: `${(dentro / maxTotal) * 100}%`, background: 'var(--p-blue)' }} />
                                      <div style={{ height: '100%', width: `${(espera / maxTotal) * 100}%`, background: 'var(--p-orange)' }} />
                                    </div>
                                    <span style={{ fontSize: 10.5, fontWeight: 700, minWidth: 60, textAlign: 'right' }}>{fmtDec(total)}d total</span>
                                  </div>
                                  <div style={{ fontSize: 9.5, color: 'var(--p-ink-3)', marginTop: 3 }}>
                                    <span style={{ color: 'var(--p-blue)' }}>● dentro</span> · <span style={{ color: 'var(--p-orange)' }}>● espera</span>
                                  </div>
                                </td>
                                <td className="num" style={{
                                  color: (s.total_em_gargalo || 0) > 0 ? 'var(--p-red)' : 'var(--p-ink-3)',
                                  fontWeight: (s.total_em_gargalo || 0) > 0 ? 800 : 500,
                                }}>
                                  {fmtNum(s.total_em_gargalo)}
                                </td>
                              </tr>
                            );
                          });
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Produção realizada movida para aba dedicada (producao-realizada) */}

            </>}

            {/* ====== ABA PRODUÇÃO REALIZADA — bar charts por setor com filtro de período ====== */}
            {pageTab === 'producao-realizada' && (
              <>
                <div className="section-head">
                  <span className="section-pill sp-green">📊 Produção realizada</span>
                  <span className="title">
                    Produção por setor · campo <b>baixados_pares</b> · janela{' '}
                    <b>{periodKey === 'custom' ? `${fmtDate(dateRange.start)} → ${fmtDate(dateRange.end)}` : PERIOD_LABEL[periodKey]}</b>
                  </span>
                </div>

                {/* Filtro de período (mesmos presets do Main Dashboard) */}
                <div className="period-filter">
                  <span className="filter-label">PERÍODO</span>
                  <div className="period-row">
                    {(['1d', '7d', '14d', '28d', '3M', '6M', '12M'] as Exclude<PeriodKey, 'custom'>[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setPeriodKey(p)}
                        className={`period-pill ${periodKey === p ? 'active' : ''}`}
                      >
                        {PERIOD_LABEL[p]}
                      </button>
                    ))}
                  </div>
                  <div className="period-custom">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      placeholder="dd/mm/aaaa"
                      className="period-date"
                    />
                    <span style={{ color: 'var(--p-ink-3)', fontSize: 13 }}>até</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      placeholder="dd/mm/aaaa"
                      className="period-date"
                    />
                    <button
                      onClick={() => { if (customStart && customEnd) setPeriodKey('custom'); }}
                      disabled={!customStart || !customEnd}
                      className="period-apply"
                    >
                      Aplicar
                    </button>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--p-ink-3)', fontStyle: 'italic' }}>
                      {periodKey === 'custom'
                        ? `${fmtDate(dateRange.start)} → ${fmtDate(dateRange.end)}`
                        : `Últimos ${PERIOD_LABEL[periodKey].replace('D', ' dias').replace('M', ' meses').replace('D-1', '1 dia')}`}
                    </span>
                  </div>
                </div>

                {/* Toggle granularidade (Diário/Semanal/Mensal) — auto-ajusta com período mas editável */}
                <div className="chart-mode-row">
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--p-ink-3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    Granularidade
                  </span>
                  {(['diario', 'semanal', 'mensal'] as ChartMode[]).map(m => (
                    <button key={m} className={`tab-btn-mini ${chartMode === m ? 'active' : ''}`} onClick={() => setChartMode(m)}>
                      {m === 'diario' ? 'Diário' : m === 'semanal' ? 'Semanal' : 'Mensal'}
                    </button>
                  ))}
                </div>

                {/* Grid de cards — regra: > 14 barras → 2 cols, senão 3 cols */}
                {producaoPorSetor.length === 0 ? (
                  <div className="loading-box">Sem dados de produção no período selecionado.</div>
                ) : (
                  <div className="prod-grid" style={{ gridTemplateColumns: `repeat(${prodGridCols}, 1fr)` }}>
                    {producaoPorSetor.map((s, i) => (
                      <ProducaoCard key={i} setor={s.setor} series={s.series} total={s.total} media={s.media} pico={s.pico} ultimo={s.ultimo} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ====== ABA REMESSAS — Cronograma + Risco crítico + TOC ====== */}
            {pageTab === 'remessas' && <>
            {/* ====== 📅 Próximas 8 semanas ====== */}
            {data.semanasEntrega && data.semanasEntrega.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 40 }}>
                  <span className="section-pill sp-purple">📅 Próximas 8 semanas</span>
                  <span className="title">Cronograma de entregas — pares programados por semana (Senda 4)</span>
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
                      {(() => {
                        const maxPares = Math.max(1, ...data.semanasEntrega!.map(s => s.pares || 0));
                        return data.semanasEntrega!.map((s, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{s.semana || '—'}</td>
                            <td>{fmtDate(s.data_inicio)}</td>
                            <td className="num"><b>{fmtNum(s.pares)}</b></td>
                            <td className="num">{fmtNum(s.remessas)}</td>
                            <td style={{ minWidth: 220 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, height: 8, background: 'var(--p-line)', borderRadius: 100, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${((s.pares || 0) / maxPares) * 100}%`, background: 'var(--p-teal)', borderRadius: 100 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>
                                  {fmtNum(s.pares)} pares
                                </span>
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ====== 🚨 Risco crítico ====== */}
            {data.remessasTop && data.remessasTop.length > 0 && (() => {
              const q = searchRisco.trim().toLowerCase();
              const filtered = q
                ? data.remessasTop.filter(r =>
                    (r.sku || '').toLowerCase().includes(q) ||
                    (r.remessa || '').toLowerCase().includes(q) ||
                    (r.nome || '').toLowerCase().includes(q) ||
                    (r.cod_ref || '').toLowerCase().includes(q)
                  )
                : data.remessasTop;
              return (
                <>
                  <div className="section-head" style={{ marginTop: 40 }}>
                    <span className="section-pill sp-red">🚨 Risco crítico</span>
                    <span className="title">Remessas atrasadas com pendente &gt; 50 pares — ordenadas pela mais atrasada</span>
                    <span className="right-info">{filtered.length} de {data.remessasTop.length} remessas</span>
                  </div>
                  <div className="search-bar">
                    <input
                      type="text"
                      value={searchRisco}
                      onChange={(e) => setSearchRisco(e.target.value)}
                      placeholder="🔍 Buscar por SKU, número da remessa ou nome do produto…"
                      className="search-input"
                    />
                  </div>
                  <RemessasTable rows={filtered} onRowClick={setSelectedRemessa} />
                </>
              );
            })()}

            {/* ====== 🔥 TOC ====== */}
            {data.remessasGargalo && data.remessasGargalo.length > 0 && (() => {
              const q = searchToc.trim().toLowerCase();
              const filtered = q
                ? data.remessasGargalo.filter(r =>
                    (r.sku || '').toLowerCase().includes(q) ||
                    (r.remessa || '').toLowerCase().includes(q) ||
                    (r.nome || '').toLowerCase().includes(q) ||
                    (r.cod_ref || '').toLowerCase().includes(q)
                  )
                : data.remessasGargalo;
              return (
                <>
                  <div className="section-head" style={{ marginTop: 40 }}>
                    <span className="section-pill sp-orange">🔥 TOC</span>
                    <span className="title">Remessas em <b>GARGALO</b> ou bloqueadas pelo gargalo — todas, por volume</span>
                    <span className="right-info">{filtered.length} de {data.remessasGargalo.length} remessas</span>
                  </div>
                  <div className="search-bar">
                    <input
                      type="text"
                      value={searchToc}
                      onChange={(e) => setSearchToc(e.target.value)}
                      placeholder="🔍 Buscar por SKU, número da remessa ou nome do produto…"
                      className="search-input"
                    />
                  </div>
                  <RemessasTable rows={filtered} showTocStatus onRowClick={setSelectedRemessa} />
                </>
              );
            })()}

            </>}

            {/* ====== ABA OPEN ORDERS ====== */}
            {pageTab === 'open-orders' && (
              <>
                <div className="section-head">
                  <span className="section-pill sp-pink">🛍 Open Orders</span>
                  <span className="title">Pedidos abertos · US + BR</span>
                </div>
                {!openOrders ? (
                  <div className="loading-box">⏳ Carregando pedidos abertos…</div>
                ) : (
                  <>
                    <div className="kpi-grid kpi-grid-4">
                      <Kpi label="Pares US" value={fmtNum(openOrders.totals?.paresUS)} accent="blue" />
                      <Kpi label="Pares BR" value={fmtNum(openOrders.totals?.paresBR)} accent="green" />
                      <Kpi label="Total" value={fmtNum(openOrders.totals?.total)} />
                      <Kpi label="SKUs únicos" value={fmtNum(openOrders.totals?.skusUnicos)} />
                    </div>
                    <div className="section-head" style={{ marginTop: 24 }}>
                      <span className="section-pill sp-teal">📋 Pedidos por SKU</span>
                      <span className="title">{openOrders.rows?.length || 0} SKUs com pedidos abertos</span>
                    </div>
                    <div className="list-card">
                      <table className="list-table">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Produto</th>
                            <th className="num">US</th>
                            <th className="num">BR</th>
                            <th className="num">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(openOrders.rows || []).slice(0, 200).map((r: any, i: number) => (
                            <tr key={i}>
                              <td><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.sku || '—'}</span></td>
                              <td>{r.produto || '—'}</td>
                              <td className="num" style={{ color: 'var(--p-blue)', fontWeight: 700 }}>{fmtNum(r.us)}</td>
                              <td className="num" style={{ color: 'var(--p-green)', fontWeight: 700 }}>{fmtNum(r.br)}</td>
                              <td className="num"><b>{fmtNum(r.total)}</b></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ====== ABA DEMANDA ====== */}
            {pageTab === 'demanda' && (
              <div className="list-card" style={{ padding: 60, textAlign: 'center', marginTop: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6, color: 'var(--p-ink)' }}>
                  Aguardando IAM <code style={{ fontSize: 13 }}>larroude-os</code>
                </div>
                <div style={{ fontSize: 13, color: 'var(--p-ink-2)', maxWidth: 540, margin: '0 auto', lineHeight: 1.5 }}>
                  Quando a SA <code>power-bi@larroude-data-prod</code> for aprovada no projeto{' '}
                  <code>larroude-os</code>, esta aba carrega o modelo de demanda{' '}
                  <code>gold.demand_model_v2</code> com 500+ SKUs e seu health score.
                </div>
              </div>
            )}

            {/* ====== ABA DIAGNÓSTICO ====== */}
            {pageTab === 'diagnostico' && (() => {
              if (!data.setores) return null;
              const classifs = data.setores.map(s => {
                const lotes = s.lotes_no_setor || 0;
                const gargalo = s.total_em_gargalo || 0;
                const diasDentro = s.avg_dias_no_setor || 0;
                const diasEspera = s.avg_dias_espera || 0;
                const pctGargalo = lotes > 0 ? gargalo / lotes : 0;
                let c: 'GARGALO' | 'SOBRECARGA' | 'SEQUENCIAMENTO' | 'SAUDAVEL';
                let razao = '';
                let color = '';
                if (pctGargalo >= 0.5 && diasDentro >= 4) {
                  c = 'GARGALO'; color = 'var(--p-red)';
                  razao = `${Math.round(pctGargalo * 100)}% lotes em gargalo · ${fmtDec(diasDentro)}d parados`;
                } else if (diasDentro >= 5) {
                  c = 'SOBRECARGA'; color = 'var(--p-orange)';
                  razao = `${fmtDec(diasDentro)}d médios dentro do setor`;
                } else if (diasEspera >= 7) {
                  c = 'SEQUENCIAMENTO'; color = 'var(--p-gold)';
                  razao = `${fmtDec(diasEspera)}d médios de espera entre setores`;
                } else {
                  c = 'SAUDAVEL'; color = 'var(--p-green)';
                  razao = `${fmtDec(diasDentro)}d dentro · ${fmtDec(diasEspera)}d espera`;
                }
                return { s, c, razao, color };
              });
              const counts = {
                GARGALO: classifs.filter(x => x.c === 'GARGALO').length,
                SOBRECARGA: classifs.filter(x => x.c === 'SOBRECARGA').length,
                SEQUENCIAMENTO: classifs.filter(x => x.c === 'SEQUENCIAMENTO').length,
                SAUDAVEL: classifs.filter(x => x.c === 'SAUDAVEL').length,
              };
              const remessasRisco = (data.remessas || data.remessasTop || [])
                .filter(r => r.is_bottleneck || (r.dias_para_entrega != null && r.dias_para_entrega < 0))
                .sort((a, b) => (b.pares_pendentes || 0) - (a.pares_pendentes || 0))
                .slice(0, 10);

              return (
                <>
                  <div className="section-head">
                    <span className="section-pill sp-red">🩺 Diagnóstico TOC</span>
                    <span className="title">Classificação automática dos {data.setores.length} setores</span>
                  </div>
                  <div className="diag-grid">
                    <div className="diag-card dc-red">
                      <div className="emoji">🔴</div>
                      <div className="qlabel">Gargalo</div>
                      <div className="qcount">{counts.GARGALO}</div>
                      <div className="qdesc">≥50% lotes em gargalo + ≥4d parados</div>
                    </div>
                    <div className="diag-card dc-orange">
                      <div className="emoji">🟠</div>
                      <div className="qlabel">Sobrecarga</div>
                      <div className="qcount">{counts.SOBRECARGA}</div>
                      <div className="qdesc">≥5d médios dentro do setor</div>
                    </div>
                    <div className="diag-card dc-gold">
                      <div className="emoji">🟡</div>
                      <div className="qlabel">Sequenciamento</div>
                      <div className="qcount">{counts.SEQUENCIAMENTO}</div>
                      <div className="qdesc">≥7d esperando entre setores</div>
                    </div>
                    <div className="diag-card dc-green">
                      <div className="emoji">🟢</div>
                      <div className="qlabel">Saudável</div>
                      <div className="qcount">{counts.SAUDAVEL}</div>
                      <div className="qdesc">Sem gargalos significativos</div>
                    </div>
                  </div>

                  <div className="section-head" style={{ marginTop: 28 }}>
                    <span className="section-pill sp-orange">🚨 Top 10 remessas em risco</span>
                    <span className="title">Gargalo ativo ou prazo de entrega ultrapassado</span>
                  </div>
                  <RemessasTable rows={remessasRisco} showTocStatus onRowClick={setSelectedRemessa} />

                  <div className="section-head" style={{ marginTop: 28 }}>
                    <span className="section-pill sp-teal">📊 Classificação por setor</span>
                    <span className="title">Diagnóstico automático TOC · ordenado por pares pendentes</span>
                  </div>
                  <div className="list-card">
                    <table className="list-table">
                      <thead>
                        <tr>
                          <th>Setor</th>
                          <th className="num">Lotes</th>
                          <th className="num">Pendente</th>
                          <th className="num">Dias setor</th>
                          <th className="num">Dias espera</th>
                          <th>Classificação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classifs
                          .slice()
                          .sort((a, b) => (b.s.pares_pendentes || 0) - (a.s.pares_pendentes || 0))
                          .map((x, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 700 }}>{x.s.nome_setor || '—'}</td>
                              <td className="num">{fmtNum(x.s.lotes_no_setor)}</td>
                              <td className="num"><b>{fmtNum(x.s.pares_pendentes)}</b></td>
                              <td className="num">{x.s.avg_dias_no_setor != null ? `${fmtDec(x.s.avg_dias_no_setor)}d` : '—'}</td>
                              <td className="num">{x.s.avg_dias_espera != null ? `${fmtDec(x.s.avg_dias_espera)}d` : '—'}</td>
                              <td>
                                <div style={{ fontSize: 11, fontWeight: 800, color: x.color }}>{x.c}</div>
                                <div style={{ fontSize: 10, color: 'var(--p-ink-3)', marginTop: 2 }}>{x.razao}</div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            <div className="foot">
              Larroudé Produção 2.0 · {data?.generatedAt ? `gerado em ${fmtDate(data.generatedAt)}` : '—'} · DM_SUPPLY_CHAIN.fct_remessas_producao
            </div>
          </>
        )}
      </div>

      {/* Modal de detalhe da remessa */}
      {selectedRemessa && (
        <RemessaModal
          remessa={selectedRemessa}
          products={modalProducts}
          loading={modalLoading}
          onClose={() => setSelectedRemessa(null)}
        />
      )}
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

/** Bar chart vertical de produção diária por setor.
 *  Barras verdes acima da média, vermelhas abaixo. Linha da média pontilhada.
 *  Pico no header. Eixo X com 3 labels (início, meio, fim). */
function ProducaoCard({ setor, series, total, media, pico, ultimo }: {
  setor: string; series: Array<{ key: string; pares: number }>;
  total: number; media: number; pico: number;
  ultimo?: { key: string; pares: number };
}) {
  if (!series.length) return null;
  const maxVal = Math.max(...series.map(s => s.pares), 1);
  const inicio = series[0]?.key;
  const meio = series[Math.floor(series.length / 2)]?.key;
  const fim = series[series.length - 1]?.key;
  const mediaY = (media / maxVal) * 100;

  function fmtBarLabel(key: string): string {
    if (key.includes('W')) return key.slice(-3); // "W26"
    if (key.length === 7) return key.slice(5); // "06"
    // YYYY-MM-DD → DD/MM
    if (key.length === 10) return key.slice(8, 10) + '/' + key.slice(5, 7);
    return key;
  }

  return (
    <div className="prod-card">
      <div className="prod-card-head">
        <div className="prod-card-title">{setor}</div>
        <div className="prod-card-pico">
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--p-ink)', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(pico)}</span>
          <span style={{ fontSize: 9, color: 'var(--p-ink-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginLeft: 4 }}>PICO</span>
        </div>
      </div>
      <div className="prod-card-meta">
        {fmtNum(total)} pares total · média <b>{fmtNum(Math.round(media))}/dia</b>
      </div>

      {/* Bar chart */}
      <div className="prod-chart">
        {/* Linha da média */}
        <div className="prod-chart-mean" style={{ bottom: `calc(${mediaY}% - 1px)` }}>
          <span className="prod-chart-mean-label">média</span>
        </div>
        {/* Barras */}
        <div className="prod-chart-bars">
          {series.map((s, i) => {
            const h = (s.pares / maxVal) * 100;
            const isLast = i === series.length - 1;
            const cor = s.pares >= media ? 'var(--p-green)' : 'var(--p-red)';
            return (
              <div key={i} className="prod-chart-col" title={`${s.key}: ${fmtNum(s.pares)} pares`}>
                <div
                  className="prod-chart-bar"
                  style={{ height: `${h}%`, background: cor, minHeight: s.pares > 0 ? 3 : 0 }}
                />
                {isLast && ultimo && (
                  <span className="prod-chart-last-label">{fmtNum(ultimo.pares)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Eixo X */}
      <div className="prod-chart-xaxis">
        <span>{fmtBarLabel(inicio || '')}</span>
        <span>{fmtBarLabel(meio || '')}</span>
        <span>{fmtBarLabel(fim || '')}</span>
      </div>
    </div>
  );
}

function RemessasTable({ rows, showTocStatus, onRowClick }: {
  rows: Remessa[]; showTocStatus?: boolean;
  onRowClick?: (r: Remessa) => void;
}) {
  // Cassia 2026-06-15: 25 linhas/pag
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [rows.length]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  return (
    <div className="list-card">
      <table className="list-table">
        <thead>
          <tr>
            <th>Remessa</th>
            <th>Produto</th>
            <th>Fábrica</th>
            <th>Setor atual</th>
            <th className="num">Pendente</th>
            <th className="num">Baixados</th>
            <th className="num">Total</th>
            {showTocStatus && <th>TOC</th>}
            <th className="num">Entrega</th>
            <th className="num">Lead time</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td colSpan={showTocStatus ? 10 : 9} style={{ padding: 40, textAlign: 'center', color: 'var(--p-ink-3)' }}>Nenhuma remessa encontrada.</td></tr>
          ) : visible.map((r, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
              title={onRowClick ? 'Clique para ver os produtos da remessa' : undefined}
            >
              <td>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, color: onRowClick ? 'var(--p-blue)' : 'var(--p-ink)' }}>
                  {r.remessa || '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--p-ink-3)', fontFamily: 'ui-monospace, monospace' }}>{r.sku || r.cod_ref || '—'}</div>
              </td>
              <td style={{ fontSize: 11 }}>{r.nome?.trim() || '—'}</td>
              <td style={{ fontSize: 10, color: 'var(--p-ink-3)' }}>{r.fabrica || '—'}</td>
              <td style={{ fontSize: 12, fontWeight: 600 }}>{r.setor_atual || '—'}</td>
              <td className="num"><b>{fmtNum(r.pares_pendentes)}</b></td>
              <td className="num" style={{ color: 'var(--p-ink-3)' }}>{fmtNum(r.pares_baixados)}</td>
              <td className="num">{fmtNum(r.pares_totais)}</td>
              {showTocStatus && (
                <td>
                  {r.toc_status ? (
                    <span className={`status-badge ${r.toc_status.toUpperCase().includes('GARGALO') ? 'st-red' : 'st-orange'}`}>
                      🔥 {r.toc_status}
                    </span>
                  ) : <span style={{ color: 'var(--p-ink-4)', fontSize: 11 }}>—</span>}
                </td>
              )}
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
      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>‹ Anterior</button>
          <span className="pg-info">
            Página <b>{safePage}</b> de <b>{totalPages}</b> · {fmtNum(rows.length)} no total
          </span>
          <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}>Próxima ›</button>
        </div>
      )}
    </div>
  );
}

/* ============= Modal de detalhe da remessa ============= */
function RemessaModal({ remessa, products, loading, onClose }: {
  remessa: Remessa; products: Remessa[] | null; loading: boolean;
  onClose: () => void;
}) {
  const totalPendente = (products || []).reduce((s, p) => s + (p.pares_pendentes || 0), 0);
  const totalBaixados = (products || []).reduce((s, p) => s + (p.pares_baixados || 0), 0);
  const totalProdutos = (products || []).reduce((s, p) => s + (p.pares_totais || 0), 0);

  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card" onClick={e => e.stopPropagation()}>
        <button className="prod-modal-close" onClick={onClose} aria-label="Fechar">×</button>

        <div className="prod-modal-label">REMESSA</div>
        <h2 className="prod-modal-title">
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{remessa.remessa}</span>
        </h2>
        <div className="prod-modal-meta">
          <span><b>Fábrica:</b> {remessa.fabrica || '—'}</span>
          <span><b>Setor atual:</b> {remessa.setor_atual || '—'}</span>
          {remessa.dt_entrega && <span><b>Entrega:</b> {fmtDate(remessa.dt_entrega)}</span>}
          {remessa.toc_status && (
            <span className={`status-badge ${remessa.toc_status.toUpperCase().includes('GARGALO') ? 'st-red' : 'st-orange'}`}>
              🔥 {remessa.toc_status}
            </span>
          )}
          {remessa.dias_para_entrega != null && remessa.dias_para_entrega < 0 && (
            <span className="status-badge st-red">{Math.abs(remessa.dias_para_entrega)}d atraso</span>
          )}
        </div>

        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--p-ink-3)', fontWeight: 600 }}>
            ⏳ Carregando produtos da remessa…
          </div>
        )}

        {!loading && products && products.length > 0 && (
          <>
            <div className="prod-modal-summary">
              <div>
                <div className="prod-modal-summary-label">PRODUTOS</div>
                <div className="prod-modal-summary-value">{products.length}</div>
              </div>
              <div>
                <div className="prod-modal-summary-label">PENDENTE</div>
                <div className="prod-modal-summary-value" style={{ color: 'var(--p-red)' }}>{fmtNum(totalPendente)}</div>
              </div>
              <div>
                <div className="prod-modal-summary-label">BAIXADOS</div>
                <div className="prod-modal-summary-value" style={{ color: 'var(--p-green)' }}>{fmtNum(totalBaixados)}</div>
              </div>
              <div>
                <div className="prod-modal-summary-label">TOTAL</div>
                <div className="prod-modal-summary-value">{fmtNum(totalProdutos)}</div>
              </div>
            </div>

            <div className="prod-modal-table-wrap">
              <table className="prod-modal-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Setor atual</th>
                    <th className="num">Pendente</th>
                    <th className="num">Baixados</th>
                    <th className="num">Total</th>
                    <th className="num">Dias no setor</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, fontWeight: 700 }}>{p.sku || '—'}</td>
                      <td style={{ fontSize: 11.5 }}>{p.nome?.trim() || p.cod_ref || '—'}</td>
                      <td style={{ fontSize: 11 }}>{p.setor_atual || '—'}</td>
                      <td className="num"><b>{fmtNum(p.pares_pendentes)}</b></td>
                      <td className="num" style={{ color: 'var(--p-ink-3)' }}>{fmtNum(p.pares_baixados)}</td>
                      <td className="num">{fmtNum(p.pares_totais)}</td>
                      <td className="num" style={{ color: (p.dias_no_setor || 0) >= 5 ? 'var(--p-orange)' : 'var(--p-ink)' }}>
                        {p.dias_no_setor != null ? `${p.dias_no_setor}d` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && (!products || products.length === 0) && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--p-ink-3)' }}>
            Nenhum produto encontrado para esta remessa.
          </div>
        )}
      </div>
    </div>
  );
}

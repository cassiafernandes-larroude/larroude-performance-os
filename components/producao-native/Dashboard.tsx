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

  // Agrupar producaoDiaria por setor → série de barras
  const producaoPorSetor = useMemo(() => {
    if (!data?.producaoDiaria) return [] as Array<{ setor: string; series: Array<{ key: string; pares: number }>; total: number; media: number; pico: number; ultimo?: { key: string; pares: number } }>;
    const bySetor = new Map<string, Map<string, number>>();
    for (const p of data.producaoDiaria) {
      if (!p.setor || !p.dia) continue;
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
  }, [data, chartMode]);

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

            {/* ====== 📊 Produção realizada — bar chart diário por setor ====== */}
            {producaoPorSetor.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 40 }}>
                  <span className="section-pill sp-green">📊 Produção realizada</span>
                  <span className="title">Produção diária por setor — campo <b>baixados_pares</b> agregado por dia, últimos 30 dias · Senda 4</span>
                  <span className="chart-toggle" style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {(['diario', 'semanal', 'mensal'] as ChartMode[]).map(m => (
                      <button key={m} className={`tab-btn-mini ${chartMode === m ? 'active' : ''}`} onClick={() => setChartMode(m)}>
                        {m === 'diario' ? 'Diário' : m === 'semanal' ? 'Semanal' : 'Mensal'}
                      </button>
                    ))}
                  </span>
                </div>
                <div className="prod-grid">
                  {producaoPorSetor.map((s, i) => (
                    <ProducaoCard key={i} setor={s.setor} series={s.series} total={s.total} media={s.media} pico={s.pico} ultimo={s.ultimo} />
                  ))}
                </div>
              </>
            )}

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
            {data.remessasTop && data.remessasTop.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 40 }}>
                  <span className="section-pill sp-red">🚨 Risco crítico</span>
                  <span className="title">Remessas atrasadas com pendente &gt; 50 pares — ordenadas pela mais atrasada</span>
                  <span className="right-info">{data.remessasTop.length} remessas</span>
                </div>
                <RemessasTable rows={data.remessasTop.slice(0, 100)} />
              </>
            )}

            {/* ====== 🔥 TOC ====== */}
            {data.remessasGargalo && data.remessasGargalo.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 40 }}>
                  <span className="section-pill sp-orange">🔥 TOC</span>
                  <span className="title">Remessas em <b>GARGALO</b> ou bloqueadas pelo gargalo — top 50 por volume</span>
                  <span className="right-info">{data.remessasGargalo.length} remessas</span>
                </div>
                <RemessasTable rows={data.remessasGargalo.slice(0, 50)} showTocStatus />
              </>
            )}

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

function RemessasTable({ rows, showTocStatus }: { rows: Remessa[]; showTocStatus?: boolean }) {
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
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700 }}>{r.remessa || '—'}</div>
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
    </div>
  );
}

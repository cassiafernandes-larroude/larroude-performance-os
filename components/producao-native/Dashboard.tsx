'use client';
// Cassia 2026-06-15: clone visual 1:1 do larroude-producao-dashboard.vercel.app
// usando design system Larroudé namespaced (.prod-root) + dados via proxy.

import { useEffect, useMemo, useState } from 'react';

type Tab = 'producao' | 'remessas' | 'open-orders' | 'demanda' | 'diagnostico';

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
}
interface ProducaoData {
  generatedAt?: string; totals?: Totals;
  fabricas?: Fabrica[]; setores?: Setor[]; remessas?: Remessa[];
}
interface OpenOrdersData {
  generatedAt?: string;
  totals?: { paresUS?: number; paresBR?: number; total?: number; skusUnicos?: number };
  rows?: Array<{ sku?: string; produto?: string; us?: number; br?: number; total?: number }>;
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

function classifSetor(s: Setor): { c: 'GARGALO' | 'SOBRECARGA' | 'SEQUENCIAMENTO' | 'SAUDAVEL'; razao: string; color: string } {
  const lotes = s.lotes_no_setor || 0;
  const gargalo = s.total_em_gargalo || 0;
  const diasNoSetor = s.avg_dias_no_setor || 0;
  const diasEspera = s.avg_dias_espera || 0;
  const pctGargalo = lotes > 0 ? gargalo / lotes : 0;
  if (pctGargalo >= 0.5 && diasNoSetor >= 4) {
    return { c: 'GARGALO', razao: `${Math.round(pctGargalo * 100)}% lotes em gargalo · ${fmtDec(diasNoSetor)}d parados`, color: 'var(--p-red)' };
  }
  if (diasNoSetor >= 5) {
    return { c: 'SOBRECARGA', razao: `${fmtDec(diasNoSetor)}d médios dentro do setor`, color: 'var(--p-orange)' };
  }
  if (diasEspera >= 7) {
    return { c: 'SEQUENCIAMENTO', razao: `${fmtDec(diasEspera)}d médios de espera entre setores`, color: 'var(--p-gold)' };
  }
  return { c: 'SAUDAVEL', razao: `${fmtDec(diasNoSetor)}d dentro · ${fmtDec(diasEspera)}d espera`, color: 'var(--p-green)' };
}

export default function ProducaoDashboard() {
  const [tab, setTab] = useState<Tab>('producao');
  const [data, setData] = useState<ProducaoData | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrdersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/producao');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) || null);
    } catch (e: any) { setError(e?.message || 'erro'); } finally { setLoading(false); }
  };
  const loadOpenOrders = async () => {
    if (openOrders) return;
    try {
      const r = await fetch('/api/producao/open-orders');
      if (r.ok) setOpenOrders(await r.json());
    } catch { /* noop */ }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === 'open-orders') loadOpenOrders();
    /* eslint-disable-next-line */
  }, [tab]);

  const diagnostico = useMemo(() => {
    if (!data?.setores) return { GARGALO: [], SOBRECARGA: [], SEQUENCIAMENTO: [], SAUDAVEL: [] };
    const g: any = { GARGALO: [], SOBRECARGA: [], SEQUENCIAMENTO: [], SAUDAVEL: [] };
    for (const s of data.setores) { g[classifSetor(s).c].push(s); }
    return g;
  }, [data]);

  const remessasRisco = useMemo(() => {
    if (!data?.remessas) return [];
    return data.remessas
      .filter(r => r.is_bottleneck || (r.dias_para_entrega != null && r.dias_para_entrega < 0))
      .sort((a, b) => (b.pares_pendentes || 0) - (a.pares_pendentes || 0))
      .slice(0, 10);
  }, [data]);

  const t = data?.totals || {};

  return (
    <div className="prod-root">
      <div className="app">

        {/* Header — h1 padronizado lpos (consistente com Inventory) */}
        <header className="mb-4">
          <div className="pt-2 pb-2 flex items-start justify-between gap-4 flex-wrap">
            <h1 className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
                style={{ color: 'var(--p-ink)', letterSpacing: '-0.025em' }}>
              Produção 2.0
            </h1>
            <button onClick={load} disabled={loading} className="refresh-btn">
              {loading ? '⏳ Carregando…' : '↻ Atualizar'}
            </button>
          </div>
          <p className="subtitle">
            Parque produtivo TOC · <b>LARROUDE FILIAL SAPIRANGA 4 - 1</b> (Senda 4)
            {data?.generatedAt && <> · gerado em <b>{fmtDate(data.generatedAt)}</b></>}
            {' · '}<span style={{ color: 'var(--p-ink-3)' }}>fonte: DM_SUPPLY_CHAIN.fct_remessas_producao</span>
          </p>
        </header>

        {/* Tab nav */}
        <div className="tab-nav">
          {([
            { id: 'producao', label: '🏭 Produção' },
            { id: 'remessas', label: '📦 Remessas' },
            { id: 'open-orders', label: '🛒 Open Orders' },
            { id: 'demanda', label: '📈 Demanda' },
            { id: 'diagnostico', label: '🔍 Diagnóstico' },
          ] as { id: Tab; label: string }[]).map(it => (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className={`tab-btn ${tab === it.id ? 'active' : ''}`}
            >
              {it.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="list-card" style={{ background: 'var(--p-red-soft)', padding: '14px 18px', color: 'var(--p-red)', fontWeight: 600, fontSize: 13 }}>
            ⚠️ Erro: {error}
          </div>
        )}

        {/* ====== Tab: Produção ====== */}
        {tab === 'producao' && (
          <>
            {loading && !data && <div className="loading-box">⏳ Carregando produção…</div>}

            {data && (
              <>
                {/* Section: Visão Geral */}
                <div className="section-head">
                  <span className="section-pill sp-gold">🥇 Visão Geral</span>
                  <span className="title"><b>Senda 4</b> · cabines de produção e remessas ativas</span>
                </div>
                <div className="kpi-grid kpi-grid-8">
                  <Kpi label="Em Remessa" value={fmtNum(t.paresPendentes)} sub="pares pendentes" />
                  <Kpi label="Baixados" value={fmtNum(t.paresBaixados)} sub="produzidos" />
                  <Kpi label="Remessas ativas" value={fmtNum(t.remessasAtivas)} />
                  <Kpi label="Em Gargalo TOC" value={fmtNum(t.remessasGargalo)} accent="red" />
                  <Kpi label="Bloqueadas TOC" value={fmtNum(t.remessasBloqueadas)} accent="red" />
                  <Kpi label="Atrasadas" value={fmtNum(t.remessasAtrasadas)} accent="gold" />
                  <Kpi label="Lead time médio" value={t.leadTimeMedio != null ? `${fmtDec(t.leadTimeMedio)}d` : '—'} />
                  <Kpi label="Próxima entrega" value={fmtDate(t.proximaEntrega)} />
                </div>

                {/* Fábricas */}
                {data.fabricas && data.fabricas.length > 0 && (
                  <>
                    <div className="section-head">
                      <span className="section-pill sp-teal">🏭 Fábricas</span>
                      <span className="title">{data.fabricas.length} fábricas · ordenadas por pares pendentes</span>
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

                {/* Setores */}
                {data.setores && data.setores.length > 0 && (
                  <>
                    <div className="section-head">
                      <span className="section-pill sp-blue">⚙️ Setores</span>
                      <span className="title">{data.setores.length} setores · sequência industrial</span>
                    </div>
                    <div className="list-card">
                      <table className="list-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Setor</th>
                            <th className="num">Lotes</th>
                            <th className="num">Pendente</th>
                            <th className="num">Dias no setor</th>
                            <th className="num">Dias espera</th>
                            <th className="num">Gargalo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.setores
                            .slice()
                            .sort((a, b) => (a.sequencia || 0) - (b.sequencia || 0))
                            .map((s, i) => (
                              <tr key={i}>
                                <td className="rank">{s.sequencia ?? '—'}</td>
                                <td style={{ fontWeight: 700 }}>{s.nome_setor || '—'}</td>
                                <td className="num">{fmtNum(s.lotes_no_setor)}</td>
                                <td className="num"><b>{fmtNum(s.pares_pendentes)}</b></td>
                                <td className="num" style={{ color: (s.avg_dias_no_setor || 0) >= 5 ? 'var(--p-orange)' : 'var(--p-ink)' }}>
                                  {s.avg_dias_no_setor != null ? `${fmtDec(s.avg_dias_no_setor)}d` : '—'}
                                </td>
                                <td className="num" style={{ color: (s.avg_dias_espera || 0) >= 7 ? 'var(--p-gold)' : 'var(--p-ink-3)' }}>
                                  {s.avg_dias_espera != null ? `${fmtDec(s.avg_dias_espera)}d` : '—'}
                                </td>
                                <td className="num" style={{
                                  color: (s.total_em_gargalo || 0) > 0 ? 'var(--p-red)' : 'var(--p-ink-3)',
                                  fontWeight: (s.total_em_gargalo || 0) > 0 ? 800 : 500,
                                }}>
                                  {fmtNum(s.total_em_gargalo)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ====== Tab: Remessas ====== */}
        {tab === 'remessas' && (
          <>
            {!data ? (
              <div className="loading-box">⏳ Carregando remessas…</div>
            ) : (
              <>
                <div className="section-head">
                  <span className="section-pill sp-purple">📦 Remessas</span>
                  <span className="title">{data.remessas?.length || 0} remessas · até 100 exibidas</span>
                </div>
                <div className="list-card">
                  <table className="list-table">
                    <thead>
                      <tr>
                        <th>Remessa</th>
                        <th>SKU</th>
                        <th>Produto</th>
                        <th>Setor atual</th>
                        <th className="num">Pendente</th>
                        <th className="num">Dias no setor</th>
                        <th className="num">Lead time</th>
                        <th className="num">Entrega</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.remessas || []).slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700 }}>
                            {r.remessa || '—'}
                            {r.is_bottleneck && <span style={{ marginLeft: 6, color: 'var(--p-red)', fontWeight: 800 }}>⚠️</span>}
                          </td>
                          <td><span className="sku-mini">{r.sku || '—'}</span></td>
                          <td style={{ fontSize: 12 }}>{r.nome || r.cod_ref || '—'}</td>
                          <td style={{ fontSize: 12 }}>{r.setor_atual || '—'}</td>
                          <td className="num"><b>{fmtNum(r.pares_pendentes)}</b></td>
                          <td className="num" style={{ color: (r.dias_no_setor || 0) >= 5 ? 'var(--p-orange)' : 'var(--p-ink)' }}>
                            {r.dias_no_setor != null ? `${r.dias_no_setor}d` : '—'}
                          </td>
                          <td className="num">{r.lead_time_acumulado_dias != null ? `${r.lead_time_acumulado_dias}d` : '—'}</td>
                          <td className="num">{fmtDate(r.dt_entrega)}</td>
                          <td><StatusBadge status={r.status_entrega} dias={r.dias_para_entrega} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ====== Tab: Open Orders ====== */}
        {tab === 'open-orders' && (
          <>
            {!openOrders ? (
              <div className="loading-box">⏳ Carregando pedidos abertos…</div>
            ) : (
              <>
                <div className="section-head">
                  <span className="section-pill sp-pink">🛒 Open Orders</span>
                  <span className="title">Pedidos abertos · US + BR</span>
                </div>
                <div className="kpi-grid kpi-grid-4">
                  <Kpi label="Pares US" value={fmtNum(openOrders.totals?.paresUS)} accent="blue" />
                  <Kpi label="Pares BR" value={fmtNum(openOrders.totals?.paresBR)} accent="green" />
                  <Kpi label="Total" value={fmtNum(openOrders.totals?.total)} />
                  <Kpi label="SKUs únicos" value={fmtNum(openOrders.totals?.skusUnicos)} />
                </div>
                <div className="section-head">
                  <span className="section-pill sp-teal">📋 Pedidos por SKU</span>
                  <span className="title">{openOrders.rows?.length || 0} SKUs</span>
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
                      {(openOrders.rows || []).slice(0, 200).map((r, i) => (
                        <tr key={i}>
                          <td><span className="sku-mini">{r.sku || '—'}</span></td>
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

        {/* ====== Tab: Demanda ====== */}
        {tab === 'demanda' && (
          <div className="list-card" style={{ padding: 60, textAlign: 'center' }}>
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

        {/* ====== Tab: Diagnóstico ====== */}
        {tab === 'diagnostico' && (
          <>
            {!data ? (
              <div className="loading-box">⏳ Carregando diagnóstico…</div>
            ) : (
              <>
                <div className="section-head">
                  <span className="section-pill sp-red">🔍 Diagnóstico TOC</span>
                  <span className="title">Classificação automática dos {data.setores?.length || 0} setores</span>
                </div>

                <div className="diag-grid">
                  <DiagCard tone="red" emoji="🔴" label="Gargalo" count={diagnostico.GARGALO.length}
                    desc="≥50% lotes em gargalo + ≥4d parados" />
                  <DiagCard tone="orange" emoji="🟠" label="Sobrecarga" count={diagnostico.SOBRECARGA.length}
                    desc="≥5d médios dentro do setor" />
                  <DiagCard tone="gold" emoji="🟡" label="Sequenciamento" count={diagnostico.SEQUENCIAMENTO.length}
                    desc="≥7d esperando entre setores" />
                  <DiagCard tone="green" emoji="🟢" label="Saudável" count={diagnostico.SAUDAVEL.length}
                    desc="Sem gargalos significativos" />
                </div>

                {/* Top 10 remessas em risco */}
                <div className="section-head">
                  <span className="section-pill sp-orange">🚨 Top 10 remessas em risco</span>
                  <span className="title">Gargalo ativo ou prazo de entrega ultrapassado</span>
                </div>
                <div className="list-card">
                  {remessasRisco.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--p-ink-3)' }}>
                      👍 Nenhuma remessa em risco crítico no momento.
                    </div>
                  ) : (
                    <table className="list-table">
                      <thead>
                        <tr>
                          <th>Remessa</th>
                          <th>Produto</th>
                          <th>Setor atual</th>
                          <th className="num">Pendente</th>
                          <th className="num">Dias atraso</th>
                          <th>Ação sugerida</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remessasRisco.map((r, i) => {
                          const atraso = r.dias_para_entrega != null && r.dias_para_entrega < 0 ? Math.abs(r.dias_para_entrega) : 0;
                          const acao =
                            r.is_bottleneck && atraso > 14 ? { label: '🔴 ESCALAR', sub: 'terceirizar ou reduzir', cls: 'st-red' as const } :
                            r.is_bottleneck ? { label: '🟠 PRIORIZAR', sub: 'empurrar no gargalo', cls: 'st-orange' as const } :
                            atraso > 7 ? { label: '🟡 RENEGOCIAR', sub: 'nova data', cls: 'st-gold' as const } :
                            { label: '🟢 MONITORAR', sub: '', cls: 'st-green' as const };
                          return (
                            <tr key={i}>
                              <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700 }}>{r.remessa || '—'}</td>
                              <td style={{ fontSize: 12 }}>{r.nome || r.sku || '—'}</td>
                              <td style={{ fontSize: 12 }}>{r.setor_atual || '—'}</td>
                              <td className="num"><b>{fmtNum(r.pares_pendentes)}</b></td>
                              <td className="num" style={{ color: atraso > 0 ? 'var(--p-red)' : 'var(--p-ink-3)', fontWeight: atraso > 0 ? 800 : 500 }}>
                                {atraso > 0 ? `${atraso}d` : '—'}
                              </td>
                              <td>
                                <span className={`status-badge ${acao.cls}`}>{acao.label}</span>
                                {acao.sub && <div style={{ fontSize: 10, color: 'var(--p-ink-3)', marginTop: 3 }}>{acao.sub}</div>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Classificação por setor */}
                {data.setores && data.setores.length > 0 && (
                  <>
                    <div className="section-head">
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
                          {data.setores
                            .slice()
                            .sort((a, b) => (b.pares_pendentes || 0) - (a.pares_pendentes || 0))
                            .map((s, i) => {
                              const cls = classifSetor(s);
                              return (
                                <tr key={i}>
                                  <td style={{ fontWeight: 700 }}>{s.nome_setor || '—'}</td>
                                  <td className="num">{fmtNum(s.lotes_no_setor)}</td>
                                  <td className="num"><b>{fmtNum(s.pares_pendentes)}</b></td>
                                  <td className="num">{s.avg_dias_no_setor != null ? `${fmtDec(s.avg_dias_no_setor)}d` : '—'}</td>
                                  <td className="num">{s.avg_dias_espera != null ? `${fmtDec(s.avg_dias_espera)}d` : '—'}</td>
                                  <td>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: cls.color }}>{cls.c}</div>
                                    <div style={{ fontSize: 10, color: 'var(--p-ink-3)', marginTop: 2 }}>{cls.razao}</div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div className="foot">
          Larroudé Produção 2.0 · {data?.generatedAt ? `gerado em ${fmtDate(data.generatedAt)}` : '—'} · DM_SUPPLY_CHAIN.fct_remessas_producao
        </div>
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

function DiagCard({ tone, emoji, label, count, desc }: { tone: 'green' | 'gold' | 'orange' | 'red'; emoji: string; label: string; count: number; desc: string }) {
  return (
    <div className={`diag-card dc-${tone}`}>
      <div className="emoji">{emoji}</div>
      <div className="qlabel">{label}</div>
      <div className="qcount">{count.toLocaleString('pt-BR')}</div>
      <div className="qdesc">{desc}</div>
    </div>
  );
}

function StatusBadge({ status, dias }: { status?: string; dias?: number }) {
  if (!status) return <span style={{ color: 'var(--p-ink-3)', fontSize: 11 }}>—</span>;
  const isLate = dias != null && dias < 0;
  return (
    <span className={`status-badge ${isLate ? 'st-red' : 'st-green'}`}>
      {status}{isLate && dias != null ? ` ${Math.abs(dias)}d` : ''}
    </span>
  );
}

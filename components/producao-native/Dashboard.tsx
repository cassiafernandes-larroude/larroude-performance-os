'use client';
// Cassia 2026-06-15: clone nativo do larroude-producao-dashboard.vercel.app.
// Shape do upstream inspecionado e mapeado (snake_case PT-BR).
//
// /api/producao → { generatedAt, totals, fabricas[], setores[], remessas[] }
//   totals: paresPendentes, paresBaixados, remessasAtivas, remessasGargalo,
//           remessasBloqueadas, remessasAtrasadas, leadTimeMedio, proximaEntrega
//   fabricas[]: nome_fabrica, remessas, pares_pendentes, pares_baixados,
//               avg_lead_time, remessas_em_gargalo
//   setores[]: nome_setor, sequencia, lotes_no_setor, pares_pendentes,
//              avg_dias_no_setor, avg_dias_espera, total_em_gargalo
//   remessas[]: remessa, nome, sku, cod_ref, fabrica, pares_pendentes,
//               pares_baixados, pares_totais, dt_entrega, setor_atual,
//               is_bottleneck, toc_status, dias_no_setor, status_entrega
//
// /api/producao/open-orders → { totals: {paresUS,paresBR,total,skusUnicos}, rows[] }

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
  nome_fabrica?: string;
  remessas?: number;
  pares_pendentes?: number;
  pares_baixados?: number;
  avg_lead_time?: number;
  remessas_em_gargalo?: number;
}

interface Setor {
  nome_setor?: string;
  sequencia?: number;
  lotes_no_setor?: number;
  pares_pendentes?: number;
  avg_dias_no_setor?: number;
  avg_dias_espera?: number;
  total_em_gargalo?: number;
}

interface Remessa {
  remessa?: string;
  nome?: string;
  sku?: string;
  cod_ref?: string;
  fabrica?: string;
  pares_pendentes?: number;
  pares_baixados?: number;
  pares_totais?: number;
  dt_entrega?: string | null;
  data_inclusao?: string | null;
  setor_atual?: string;
  is_bottleneck?: boolean;
  toc_status?: string | null;
  dias_no_setor?: number;
  dias_espera_entre_setores?: number;
  dias_sem_movimentacao?: number;
  lead_time_acumulado_dias?: number;
  status_entrega?: string;
  dias_para_entrega?: number;
}

interface ProducaoData {
  generatedAt?: string;
  totals?: Totals;
  fabricas?: Fabrica[];
  setores?: Setor[];
  remessas?: Remessa[];
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

/** Classificação TOC dos setores (Cassia documentou). */
function classifSetor(s: Setor): { c: 'GARGALO' | 'SOBRECARGA' | 'SEQUENCIAMENTO' | 'SAUDÁVEL'; razao: string; color: string } {
  const lotes = s.lotes_no_setor || 0;
  const gargalo = s.total_em_gargalo || 0;
  const diasNoSetor = s.avg_dias_no_setor || 0;
  const diasEspera = s.avg_dias_espera || 0;
  const pctGargalo = lotes > 0 ? gargalo / lotes : 0;

  if (pctGargalo >= 0.5 && diasNoSetor >= 4) {
    return { c: 'GARGALO', razao: `${Math.round(pctGargalo * 100)}% lotes em gargalo · ${fmtDec(diasNoSetor)}d parados`, color: '#DC2626' };
  }
  if (diasNoSetor >= 5) {
    return { c: 'SOBRECARGA', razao: `${fmtDec(diasNoSetor)}d médios dentro do setor`, color: '#D97706' };
  }
  if (diasEspera >= 7) {
    return { c: 'SEQUENCIAMENTO', razao: `${fmtDec(diasEspera)}d médios de espera entre setores`, color: '#CA8A04' };
  }
  return { c: 'SAUDÁVEL', razao: `${fmtDec(diasNoSetor)}d dentro · ${fmtDec(diasEspera)}d espera`, color: '#16A34A' };
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
      const d = await r.json();
      setData(d || null);
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

  // Diagnóstico — classifica setores
  const diagnostico = useMemo(() => {
    if (!data?.setores) return { gargalo: [], sobrecarga: [], sequenciamento: [], saudavel: [] };
    const groups: any = { GARGALO: [], SOBRECARGA: [], SEQUENCIAMENTO: [], SAUDÁVEL: [] };
    for (const s of data.setores) {
      const cls = classifSetor(s);
      groups[cls.c].push({ s, cls });
    }
    return {
      gargalo: groups.GARGALO, sobrecarga: groups.SOBRECARGA,
      sequenciamento: groups.SEQUENCIAMENTO, saudavel: groups.SAUDÁVEL,
    };
  }, [data]);

  // Top remessas em risco — gargalo + atrasadas
  const remessasRisco = useMemo(() => {
    if (!data?.remessas) return [];
    return data.remessas
      .filter(r => r.is_bottleneck || (r.dias_para_entrega != null && r.dias_para_entrega < 0))
      .sort((a, b) => (b.pares_pendentes || 0) - (a.pares_pendentes || 0))
      .slice(0, 10);
  }, [data]);

  const t = data?.totals || {};

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header padronizado */}
      <header className="mb-5">
        <div className="pt-2 pb-2 flex items-start justify-between gap-4 flex-wrap">
          <h1
            className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
          >
            Produção 2.0
          </h1>
          <button
            onClick={load}
            disabled={loading}
            className="pill pill-ghost px-3 py-1.5 text-[12px]"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '⏳ Carregando…' : '↻ Atualizar'}
          </button>
        </div>
        <p className="text-[13px] mt-2" style={{ color: 'var(--ink-soft)' }}>
          Parque produtivo TOC · <b>LARROUDE FILIAL SAPIRANGA 4 - 1</b> (Senda 4)
          {data?.generatedAt && <> · gerado em <b>{fmtDate(data.generatedAt)}</b></>}
          {' · '}<span style={{ color: 'var(--ink-muted)' }}>fonte: DM_SUPPLY_CHAIN.fct_remessas_producao</span>
        </p>
      </header>

      {/* Tab nav */}
      <div className="flex gap-1 mb-5 flex-wrap" style={{ borderBottom: '1.5px solid var(--border)' }}>
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
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: tab === it.id ? 'var(--card)' : 'transparent',
              color: tab === it.id ? 'var(--ink)' : 'var(--ink-soft)',
              border: tab === it.id ? '1.5px solid var(--border)' : '1.5px solid transparent',
              borderBottomColor: tab === it.id ? 'var(--card)' : 'transparent',
              borderRadius: '10px 10px 0 0',
              marginBottom: -1.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {it.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card mb-4" style={{ background: '#FEE2E2', color: '#DC2626', fontWeight: 600, fontSize: 13 }}>
          ⚠️ Erro: {error}
        </div>
      )}

      {/* ====== Tab: Produção ====== */}
      {tab === 'producao' && (
        <>
          {loading && !data && (
            <div className="card text-center" style={{ padding: 80, color: 'var(--ink-muted)' }}>⏳ Carregando produção…</div>
          )}

          {data && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-5">
                <Kpi label="Em Remessa" value={fmtNum(t.paresPendentes)} sub="pares pendentes" tone="orange" />
                <Kpi label="Baixados" value={fmtNum(t.paresBaixados)} sub="produzidos" tone="green" />
                <Kpi label="Remessas ativas" value={fmtNum(t.remessasAtivas)} />
                <Kpi label="Em Gargalo TOC" value={fmtNum(t.remessasGargalo)} tone="red" />
                <Kpi label="Bloqueadas TOC" value={fmtNum(t.remessasBloqueadas)} tone="red" />
                <Kpi label="Atrasadas" value={fmtNum(t.remessasAtrasadas)} tone="gold" />
                <Kpi label="Lead time médio" value={t.leadTimeMedio != null ? `${fmtDec(t.leadTimeMedio)}d` : '—'} />
                <Kpi label="Próxima entrega" value={fmtDate(t.proximaEntrega)} tone="blue" />
              </div>

              {/* Fábricas */}
              {data.fabricas && data.fabricas.length > 0 && (
                <Section title="🏭 Fábricas" subtitle={`${data.fabricas.length} fábricas · ordenadas por pares pendentes`}>
                  <Table
                    headers={['Fábrica', 'Remessas', 'Pendente', 'Baixados', 'Lead time', 'Gargalo']}
                    rows={data.fabricas
                      .slice()
                      .sort((a, b) => (b.pares_pendentes || 0) - (a.pares_pendentes || 0))
                      .map(f => [
                        <span key="n" style={{ fontWeight: 600 }}>{f.nome_fabrica || '—'}</span>,
                        fmtNum(f.remessas),
                        <b key="p">{fmtNum(f.pares_pendentes)}</b>,
                        <span key="b" style={{ color: 'var(--ink-soft)' }}>{fmtNum(f.pares_baixados)}</span>,
                        f.avg_lead_time != null ? `${fmtDec(f.avg_lead_time)}d` : '—',
                        <span key="g" style={{ color: (f.remessas_em_gargalo || 0) > 0 ? '#DC2626' : 'var(--ink-soft)', fontWeight: (f.remessas_em_gargalo || 0) > 0 ? 700 : 400 }}>
                          {fmtNum(f.remessas_em_gargalo)}
                        </span>,
                      ])}
                  />
                </Section>
              )}

              {/* Setores */}
              {data.setores && data.setores.length > 0 && (
                <Section title="⚙️ Setores · sequência industrial" subtitle={`${data.setores.length} setores · ordenados pela sequência`}>
                  <Table
                    headers={['#', 'Setor', 'Lotes', 'Pendente', 'Dias no setor', 'Dias espera', 'Gargalo']}
                    rows={data.setores
                      .slice()
                      .sort((a, b) => (a.sequencia || 0) - (b.sequencia || 0))
                      .map(s => [
                        <span key="seq" style={{ color: 'var(--ink-muted)', fontSize: 11 }}>{s.sequencia ?? '—'}</span>,
                        <span key="n" style={{ fontWeight: 600 }}>{s.nome_setor || '—'}</span>,
                        fmtNum(s.lotes_no_setor),
                        <b key="p">{fmtNum(s.pares_pendentes)}</b>,
                        <span key="d" style={{ color: (s.avg_dias_no_setor || 0) >= 5 ? '#D97706' : 'var(--ink)' }}>
                          {s.avg_dias_no_setor != null ? `${fmtDec(s.avg_dias_no_setor)}d` : '—'}
                        </span>,
                        <span key="e" style={{ color: (s.avg_dias_espera || 0) >= 7 ? '#CA8A04' : 'var(--ink-soft)' }}>
                          {s.avg_dias_espera != null ? `${fmtDec(s.avg_dias_espera)}d` : '—'}
                        </span>,
                        <span key="g" style={{ color: (s.total_em_gargalo || 0) > 0 ? '#DC2626' : 'var(--ink-soft)', fontWeight: (s.total_em_gargalo || 0) > 0 ? 700 : 400 }}>
                          {fmtNum(s.total_em_gargalo)}
                        </span>,
                      ])}
                  />
                </Section>
              )}
            </>
          )}
        </>
      )}

      {/* ====== Tab: Remessas ====== */}
      {tab === 'remessas' && (
        <>
          {!data ? (
            <div className="card text-center" style={{ padding: 80, color: 'var(--ink-muted)' }}>⏳ Carregando remessas…</div>
          ) : (
            <Section title="📦 Lista de remessas" subtitle={`${data.remessas?.length || 0} remessas`}>
              <Table
                headers={['Remessa', 'SKU', 'Produto', 'Fábrica', 'Setor atual', 'Pendente', 'Dias no setor', 'Lead time', 'Entrega', 'Status']}
                rows={(data.remessas || []).slice(0, 100).map(r => [
                  <span key="n" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, fontWeight: 700 }}>
                    {r.remessa || '—'}{r.is_bottleneck && <span style={{ marginLeft: 6, color: '#DC2626', fontWeight: 800 }}>⚠️</span>}
                  </span>,
                  <span key="s" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--ink-muted)' }}>{r.sku || '—'}</span>,
                  <span key="p" style={{ fontSize: 11 }}>{r.nome || r.cod_ref || '—'}</span>,
                  <span key="f" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{r.fabrica || '—'}</span>,
                  r.setor_atual || '—',
                  <b key="pn">{fmtNum(r.pares_pendentes)}</b>,
                  <span key="d" style={{ color: (r.dias_no_setor || 0) >= 5 ? '#D97706' : 'var(--ink)' }}>{r.dias_no_setor != null ? `${r.dias_no_setor}d` : '—'}</span>,
                  r.lead_time_acumulado_dias != null ? `${r.lead_time_acumulado_dias}d` : '—',
                  fmtDate(r.dt_entrega),
                  <StatusBadge key="st" status={r.status_entrega} dias={r.dias_para_entrega} />,
                ])}
              />
            </Section>
          )}
        </>
      )}

      {/* ====== Tab: Open Orders ====== */}
      {tab === 'open-orders' && (
        <>
          {!openOrders ? (
            <div className="card text-center" style={{ padding: 80, color: 'var(--ink-muted)' }}>⏳ Carregando pedidos abertos…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
                <Kpi label="Pares US" value={fmtNum(openOrders.totals?.paresUS)} tone="blue" />
                <Kpi label="Pares BR" value={fmtNum(openOrders.totals?.paresBR)} tone="green" />
                <Kpi label="Total" value={fmtNum(openOrders.totals?.total)} />
                <Kpi label="SKUs únicos" value={fmtNum(openOrders.totals?.skusUnicos)} />
              </div>
              <Section title="🛒 Pedidos por SKU" subtitle={`${openOrders.rows?.length || 0} SKUs`}>
                <Table
                  headers={['SKU', 'Produto', 'US', 'BR', 'Total']}
                  rows={(openOrders.rows || []).slice(0, 200).map(r => [
                    <span key="s" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.sku || '—'}</span>,
                    r.produto || '—',
                    <span key="u" style={{ color: '#1E40AF', fontWeight: 600 }}>{fmtNum(r.us)}</span>,
                    <span key="b" style={{ color: '#16A34A', fontWeight: 600 }}>{fmtNum(r.br)}</span>,
                    <b key="t">{fmtNum(r.total)}</b>,
                  ])}
                />
              </Section>
            </>
          )}
        </>
      )}

      {/* ====== Tab: Demanda ====== */}
      {tab === 'demanda' && (
        <div className="card text-center" style={{ padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--ink)' }}>
            Aguardando IAM <code style={{ fontSize: 13 }}>larroude-os</code>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', maxWidth: 520, margin: '0 auto', lineHeight: 1.5 }}>
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
            <div className="card text-center" style={{ padding: 80, color: 'var(--ink-muted)' }}>⏳ Carregando diagnóstico…</div>
          ) : (
            <>
              {/* 4 cards de classificação */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <DiagCard
                  icon="🔴" label="GARGALO" count={diagnostico.gargalo.length}
                  desc="≥50% lotes em gargalo + dias parados altos"
                  color="#DC2626"
                />
                <DiagCard
                  icon="🟠" label="SOBRECARGA" count={diagnostico.sobrecarga.length}
                  desc="Setor processando lento (≥5d médios)"
                  color="#D97706"
                />
                <DiagCard
                  icon="🟡" label="SEQUENCIAMENTO" count={diagnostico.sequenciamento.length}
                  desc="Espera entre setores ≥7d"
                  color="#CA8A04"
                />
                <DiagCard
                  icon="🟢" label="SAUDÁVEL" count={diagnostico.saudavel.length}
                  desc="Sem gargalos significativos"
                  color="#16A34A"
                />
              </div>

              {/* Top 10 remessas em risco */}
              <Section title="🚨 Top 10 remessas em risco" subtitle="Gargalo ativo ou prazo de entrega ultrapassado">
                {remessasRisco.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-muted)' }}>
                    👍 Nenhuma remessa em risco crítico no momento.
                  </div>
                ) : (
                  <Table
                    headers={['Remessa', 'Produto', 'Setor atual', 'Pendente', 'Dias atraso', 'Ação sugerida']}
                    rows={remessasRisco.map(r => {
                      const atraso = r.dias_para_entrega != null && r.dias_para_entrega < 0 ? Math.abs(r.dias_para_entrega) : 0;
                      const acao =
                        r.is_bottleneck && atraso > 14 ? { label: '🔴 ESCALAR', sub: 'terceirizar ou reduzir', color: '#DC2626' } :
                        r.is_bottleneck ? { label: '🟠 PRIORIZAR', sub: 'empurrar no gargalo', color: '#D97706' } :
                        atraso > 7 ? { label: '🟡 RENEGOCIAR', sub: 'nova data', color: '#CA8A04' } :
                        { label: '🟢 MONITORAR', sub: '', color: '#16A34A' };
                      return [
                        <span key="r" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700 }}>{r.remessa || '—'}</span>,
                        <span key="p" style={{ fontSize: 11 }}>{r.nome || r.sku || '—'}</span>,
                        r.setor_atual || '—',
                        <b key="pn">{fmtNum(r.pares_pendentes)}</b>,
                        atraso > 0 ? <span key="a" style={{ color: '#DC2626', fontWeight: 700 }}>{atraso}d</span> : '—',
                        <div key="acao">
                          <div style={{ fontSize: 11, fontWeight: 700, color: acao.color }}>{acao.label}</div>
                          {acao.sub && <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{acao.sub}</div>}
                        </div>,
                      ];
                    })}
                  />
                )}
              </Section>

              {/* Lista de setores classificados */}
              {data.setores && data.setores.length > 0 && (
                <Section title="📊 Classificação por setor" subtitle="Diagnóstico automático TOC">
                  <Table
                    headers={['Setor', 'Lotes', 'Pendente', 'Dias setor', 'Dias espera', 'Classificação']}
                    rows={data.setores
                      .slice()
                      .sort((a, b) => (b.pares_pendentes || 0) - (a.pares_pendentes || 0))
                      .map(s => {
                        const cls = classifSetor(s);
                        return [
                          <span key="n" style={{ fontWeight: 600 }}>{s.nome_setor || '—'}</span>,
                          fmtNum(s.lotes_no_setor),
                          <b key="p">{fmtNum(s.pares_pendentes)}</b>,
                          s.avg_dias_no_setor != null ? `${fmtDec(s.avg_dias_no_setor)}d` : '—',
                          s.avg_dias_espera != null ? `${fmtDec(s.avg_dias_espera)}d` : '—',
                          <div key="c">
                            <div style={{ fontSize: 11, fontWeight: 700, color: cls.color }}>{cls.c}</div>
                            <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{cls.razao}</div>
                          </div>,
                        ];
                      })}
                  />
                </Section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ============================== sub-componentes ============================== */
function Kpi({ label, value, sub, tone }: {
  label: string; value: string; sub?: string;
  tone?: 'green' | 'red' | 'orange' | 'blue' | 'gold';
}) {
  const palette: Record<string, { bg: string; bd: string; col: string }> = {
    green: { bg: 'rgba(16,185,129,0.06)', bd: '#16A34A', col: '#166534' },
    red: { bg: 'rgba(239,68,68,0.06)', bd: '#DC2626', col: '#991B1B' },
    orange: { bg: 'rgba(251,146,60,0.06)', bd: '#FB923C', col: '#9A3412' },
    blue: { bg: 'rgba(37,99,184,0.06)', bd: '#2563B8', col: '#1E40AF' },
    gold: { bg: 'rgba(202,138,4,0.06)', bd: '#CA8A04', col: '#854D0E' },
  };
  const p = tone ? palette[tone] : null;
  return (
    <div className="card" style={{ padding: '14px 12px', background: p?.bg || 'white', borderLeft: p ? `3px solid ${p.bd}` : undefined }}>
      <div className="text-[10px] uppercase tracking-wider font-bold leading-tight" style={{ color: p?.col || 'var(--ink-soft)' }}>{label}</div>
      <div className="font-num font-bold mt-1.5" style={{ fontSize: 22, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div className="text-[10.5px] mt-1" style={{ color: 'var(--ink-muted)' }}>{sub}</div>}
    </div>
  );
}

function DiagCard({ icon, label, count, desc, color }: { icon: string; label: string; count: number; desc: string; color: string }) {
  return (
    <div className="card" style={{ padding: 16, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)', marginTop: 4, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{count}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

function StatusBadge({ status, dias }: { status?: string; dias?: number }) {
  if (!status) return <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>—</span>;
  const isLate = dias != null && dias < 0;
  const palette = isLate
    ? { bg: '#FEE2E2', col: '#DC2626' }
    : { bg: '#DCFCE7', col: '#166534' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, background: palette.bg, color: palette.col,
      letterSpacing: '0.04em', textTransform: 'uppercase' as const,
    }}>
      {status}{isLate && dias != null ? ` ${Math.abs(dias)}d` : ''}
    </span>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <h2 className="font-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{title}</h2>
        {subtitle && <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{subtitle}</span>}
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>{children}</div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 700 }}>
      <thead style={{ background: 'var(--paper)', borderBottom: '1.5px solid var(--border)' }}>
        <tr>
          {headers.map((h, i) => (
            <th
              key={i}
              style={{
                padding: '10px 12px',
                textAlign: i <= 2 ? 'left' : 'right',
                fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-muted)' }}>Sem dados.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
            {r.map((cell, j) => (
              <td
                key={j}
                style={{
                  padding: '9px 12px',
                  textAlign: j <= 2 ? 'left' : 'right',
                  fontVariantNumeric: 'tabular-nums',
                  verticalAlign: 'top',
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

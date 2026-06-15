'use client';
// Cassia 2026-06-15: clone do larroude-producao-dashboard.vercel.app internalizado.
// Estrutura (DOCUMENTACAO-COMPLETA-dashboards-larroude.md §9):
//   - Header padrao do Performance OS
//   - Tab nav: Produção · Remessas · Open Orders · Demanda · Diagnóstico
//   - Fabrica unica: LARROUDE FILIAL SAPIRANGA 4 - 1 (Senda 4)
//   - Dados via proxy /api/producao/* (upstream larroude-producao-dashboard)
import { useEffect, useMemo, useState } from 'react';

type Tab = 'producao' | 'remessas' | 'open-orders' | 'demanda' | 'diagnostico';

interface ProducaoData {
  generatedAt?: string;
  totals?: {
    emRemessa?: number;
    baixados?: number;
    remessasAtivas?: number;
    emGargalo?: number;
    bloqueadas?: number;
    leadTime?: number;
    proximaEntrega?: string;
    openOrders?: number;
  };
  fabricas?: Array<{ nome: string; pendente: number; total: number }>;
  setores?: Array<{ nome: string; pendente: number; emGargalo: number; diasNoSetor: number }>;
  riscoCritico?: Array<any>;
  tocGargalos?: Array<any>;
  diariaSetor?: Record<string, Array<{ dia: string; pares: number }>>;
}

interface RemessasData {
  generatedAt?: string;
  remessas?: Array<{
    remessa: string;
    sku: string;
    produto: string;
    setor: string;
    pendente: number;
    diasNoSetor: number;
    leadTime: number;
    dtEntrega?: string | null;
    isBottleneck?: boolean;
  }>;
}

interface OpenOrdersData {
  generatedAt?: string;
  totals?: { paresUS?: number; paresBR?: number; total?: number; skusUnicos?: number };
  rows?: Array<{ sku: string; produto: string; us: number; br: number; total: number }>;
}

function fmtNum(v: number | undefined | null): string {
  if (v == null || !isFinite(v)) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    const d = new Date(v + (v.length === 10 ? 'T00:00:00Z' : ''));
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  } catch { return v; }
}

export default function ProducaoDashboard() {
  const [tab, setTab] = useState<Tab>('producao');
  const [data, setData] = useState<ProducaoData | null>(null);
  const [remessas, setRemessas] = useState<RemessasData | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrdersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/producao');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const loadRemessas = async () => {
    if (remessas) return;
    try {
      const r = await fetch('/api/producao/remessas');
      if (r.ok) setRemessas(await r.json());
    } catch {}
  };

  const loadOpenOrders = async () => {
    if (openOrders) return;
    try {
      const r = await fetch('/api/producao/open-orders');
      if (r.ok) setOpenOrders(await r.json());
    } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === 'remessas') loadRemessas();
    if (tab === 'open-orders') loadOpenOrders();
    /* eslint-disable-next-line */
  }, [tab]);

  const t = data?.totals;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto" style={{ background: 'var(--paper)' }}>
      {/* Header padronizado */}
      <header className="mb-6">
        <div className="pt-2 pb-2 flex items-start justify-between gap-4 flex-wrap">
          <h1 className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}>
            Produção 2.0
          </h1>
          <button onClick={load} disabled={loading} className="pill pill-pink px-4 py-1.5 text-[13px]" style={{ opacity: loading ? 0.6 : 1 }}>
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
      <div className="flex gap-2 mb-5 flex-wrap" style={{ borderBottom: '1.5px solid var(--border)', paddingBottom: 0 }}>
        {([
          { id: 'producao', label: '🏭 Produção' },
          { id: 'remessas', label: '📦 Remessas' },
          { id: 'open-orders', label: '🛒 Open Orders' },
          { id: 'demanda', label: '📈 Demanda' },
          { id: 'diagnostico', label: '🔍 Diagnóstico' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              background: tab === t.id ? 'var(--card)' : 'transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-soft)',
              border: tab === t.id ? '1.5px solid var(--border)' : '1.5px solid transparent',
              borderBottom: tab === t.id ? '1.5px solid var(--card)' : '1.5px solid transparent',
              borderRadius: '12px 12px 0 0',
              marginBottom: -1.5,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card mb-4" style={{ background: '#FEE2E2', color: '#DC2626', fontWeight: 600, fontSize: 13 }}>
          ⚠️ Erro ao carregar: {error}
        </div>
      )}

      {/* ============ Tab: Produção ============ */}
      {tab === 'producao' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-5">
            <Kpi label="Em Remessa" value={fmtNum(t?.emRemessa)} sub="pares pendentes" tone="orange" />
            <Kpi label="Baixados" value={fmtNum(t?.baixados)} sub="prod. finalizados" tone="green" />
            <Kpi label="Remessas ativas" value={fmtNum(t?.remessasAtivas)} />
            <Kpi label="Em Gargalo TOC" value={fmtNum(t?.emGargalo)} tone="red" />
            <Kpi label="Bloqueadas TOC" value={fmtNum(t?.bloqueadas)} tone="red" />
            <Kpi label="Lead time médio" value={t?.leadTime ? `${t.leadTime.toFixed(0)}d` : '—'} />
            <Kpi label="Próxima entrega" value={fmtDate(t?.proximaEntrega)} sub="data prevista" />
            <Kpi label="Open Orders" value={fmtNum(t?.openOrders)} sub="US + BR" tone="blue" />
          </div>

          {/* Tabela Fábricas */}
          {data?.fabricas && data.fabricas.length > 0 && (
            <Section title="🏭 Fábricas" subtitle="Ordenado por pares pendentes">
              <Table
                headers={['Fábrica', 'Pendente', 'Total', '% Pendente']}
                rows={data.fabricas.map(f => [
                  <span key="n" style={{ fontWeight: 600 }}>{f.nome}</span>,
                  <span key="p" style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmtNum(f.pendente)}</span>,
                  fmtNum(f.total),
                  <span key="pct" style={{ color: f.total > 0 && f.pendente / f.total > 0.5 ? '#DC2626' : 'var(--ink-soft)' }}>
                    {f.total > 0 ? `${((f.pendente / f.total) * 100).toFixed(0)}%` : '—'}
                  </span>,
                ])}
              />
            </Section>
          )}

          {/* Tabela Setores */}
          {data?.setores && data.setores.length > 0 && (
            <Section title="⚙️ Setores · sequência industrial" subtitle={`${data.setores.length} setores ativos`}>
              <Table
                headers={['Setor', 'Pendente', 'Em Gargalo', 'Dias no setor']}
                rows={data.setores.map(s => [
                  <span key="n" style={{ fontWeight: 600 }}>{s.nome}</span>,
                  fmtNum(s.pendente),
                  <span key="g" style={{ color: s.emGargalo > 0 ? '#DC2626' : 'var(--ink-soft)', fontWeight: s.emGargalo > 0 ? 700 : 400 }}>
                    {fmtNum(s.emGargalo)}
                  </span>,
                  <span key="d" style={{ color: s.diasNoSetor >= 5 ? '#D97706' : 'var(--ink)' }}>
                    {s.diasNoSetor.toFixed(1)}d
                  </span>,
                ])}
              />
            </Section>
          )}

          {loading && !data && (
            <div className="card text-center" style={{ padding: 80, color: 'var(--ink-muted)' }}>
              ⏳ Carregando produção…
            </div>
          )}
        </>
      )}

      {/* ============ Tab: Remessas ============ */}
      {tab === 'remessas' && (
        <>
          {!remessas ? (
            <div className="card text-center" style={{ padding: 80, color: 'var(--ink-muted)' }}>⏳ Carregando remessas…</div>
          ) : (
            <Section title="📦 Lista de remessas" subtitle={`${remessas.remessas?.length || 0} remessas ativas`}>
              <Table
                headers={['Remessa', 'SKU', 'Produto', 'Setor atual', 'Pendente', 'Dias no setor', 'Lead time', 'Entrega']}
                rows={(remessas.remessas || []).slice(0, 50).map(r => [
                  <span key="n" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700 }}>
                    {r.remessa}{r.isBottleneck && <span style={{ marginLeft: 6, color: '#DC2626', fontWeight: 800 }}>⚠️</span>}
                  </span>,
                  <span key="s" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--ink-muted)' }}>{r.sku}</span>,
                  r.produto,
                  r.setor,
                  <b key="p">{fmtNum(r.pendente)}</b>,
                  <span key="d" style={{ color: r.diasNoSetor >= 5 ? '#D97706' : 'var(--ink)' }}>{r.diasNoSetor}d</span>,
                  `${r.leadTime}d`,
                  fmtDate(r.dtEntrega),
                ])}
              />
            </Section>
          )}
        </>
      )}

      {/* ============ Tab: Open Orders ============ */}
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
              <Section title="🛒 Pedidos por SKU" subtitle={`${openOrders.rows?.length || 0} SKUs com pedidos abertos`}>
                <Table
                  headers={['SKU', 'Produto', 'US', 'BR', 'Total']}
                  rows={(openOrders.rows || []).slice(0, 100).map(r => [
                    <span key="s" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.sku}</span>,
                    r.produto,
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

      {/* ============ Tab: Demanda ============ */}
      {tab === 'demanda' && (
        <div className="card text-center" style={{ padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--ink)' }}>
            Aguardando IAM <code style={{ fontSize: 13 }}>larroude-os</code>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', maxWidth: 520, margin: '0 auto', lineHeight: 1.5 }}>
            Quando a SA <code>power-bi@larroude-data-prod</code> for aprovada no projeto <code>larroude-os</code>,
            esta aba carrega o modelo de demanda <code>gold.demand_model_v2</code> com 500+ SKUs e seu health score.
          </div>
        </div>
      )}

      {/* ============ Tab: Diagnóstico ============ */}
      {tab === 'diagnostico' && (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)' }}>
          🔍 Diagnóstico — em construção. Próxima iteração trará: 4 cards de classificação (Gargalo / Sobrecarga / Sequenciamento / Saudável), gráficos de tempo perdido por setor e Top 10 remessas em risco com ação sugerida.
        </div>
      )}
    </div>
  );
}

/* ============================== sub-componentes ============================== */
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'orange' | 'blue' | 'gold' }) {
  const palette: Record<string, { bg: string; bd: string; col: string }> = {
    green: { bg: 'rgba(16,185,129,0.06)', bd: '#16A34A', col: '#166534' },
    red: { bg: 'rgba(239,68,68,0.06)', bd: '#DC2626', col: '#991B1B' },
    orange: { bg: 'rgba(251,146,60,0.06)', bd: '#FB923C', col: '#9A3412' },
    blue: { bg: 'rgba(37,99,184,0.06)', bd: '#2563B8', col: '#1E40AF' },
    gold: { bg: 'rgba(184,134,31,0.06)', bd: '#B8861F', col: '#854D0E' },
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
            <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 || i === 1 || i === 2 ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
            {r.map((cell, j) => (
              <td key={j} style={{ padding: '9px 12px', textAlign: j === 0 || j === 1 || j === 2 ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={headers.length} style={{ padding: 30, textAlign: 'center', color: 'var(--ink-muted)' }}>Sem dados.</td></tr>
        )}
      </tbody>
    </table>
  );
}

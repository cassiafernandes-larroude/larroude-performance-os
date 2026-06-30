'use client';
// Cassia 2026-06-30: aba Sessões — visão completa de sessões (Shopify Analytics via ShopifyQL).
// Seções: Visão geral (KPIs + sessões ao longo do tempo + funil), Por página (tipo + top páginas),
// Por coleção, Por canal/fonte (referrer_source / referrer_name / utm_source).

import { useEffect, useMemo, useState } from 'react';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import type { Period } from '@/types/metric';

type Market = 'US' | 'BR';
const PRESETS: Period[] = ['7d', '14d', '28d', '3M', '6M', '12M'];

interface Metrics { sessions: number; cart: number; checkout: number; completed: number; bounceRate: number; cartRate: number; checkoutRate: number; convRate: number; }
interface AggRow { key: string; sessions: number; cart: number; checkout: number; completed: number; bounceRate: number; cartRate: number; checkoutRate: number; convRate: number; }
interface DimRow { key: string; sessions: number; completed: number; convRate: number; }
interface ChannelRow { channel: string; sessions: number; share: number; convRate: number; }
interface Bundle {
  market: Market; start: string; end: string; gran: string;
  totals: Metrics; series: { date: string; sessions: number; completed: number; convRate: number }[];
  byType: AggRow[]; byCollection: AggRow[]; allPages: AggRow[];
  channelShare: { total: number; channels: ChannelRow[] };
  byReferrer: DimRow[]; byUtm: DimRow[];
}

const fmtN = (v: number) => (v || 0).toLocaleString('pt-BR');
const fmtP = (v: number, d = 1) => `${(v || 0).toFixed(d)}%`;

const PILL_ON = 'rounded-full px-4 py-1.5 text-[13px] font-semibold';
const PILL_OFF = 'rounded-full px-4 py-1.5 text-[13px] font-medium';

export default function SessoesPage() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<Period>('28d');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [applied, setApplied] = useState<{ start: string; end: string } | null>(null);
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1); // paginação da tabela "Sessões por página"
  const PER_PAGE = 25;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null); setPageNum(1);
    const qs = new URLSearchParams();
    if (applied) { qs.set('start', applied.start); qs.set('end', applied.end); } else { qs.set('period', period); }
    fetch(`/api/sessions/${market}?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (cancelled) return; if (j.error) throw new Error(j.detail || j.error); setData(j); setLoading(false); })
      .catch((e) => { if (cancelled) return; setErr(String(e.message || e)); setLoading(false); });
    return () => { cancelled = true; };
  }, [market, period, applied]);

  const sessionPts: BarPoint[] = useMemo(() => (data?.series || []).map((p) => ({ date: p.date, value: p.sessions, color: '#5d4ec5' })), [data]);
  const convPts: BarPoint[] = useMemo(() => (data?.series || []).map((p) => ({ date: p.date, value: Number(p.convRate.toFixed(2)), color: '#16A34A' })), [data]);

  function applyDates() {
    if (/^\d{4}-\d{2}-\d{2}$/.test(draftStart) && /^\d{4}-\d{2}-\d{2}$/.test(draftEnd)) setApplied({ start: draftStart, end: draftEnd });
  }

  const t = data?.totals;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <div className="mb-4">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: '#1A1A1A' }}>Sessões</h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: '#4A4A4A' }}>
          Visão completa de sessões do site — por página, coleção e canal · Shopify Analytics (ShopifyQL)
        </p>
      </div>

      {/* Market + período */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => setMarket('US')} className={market === 'US' ? PILL_ON : PILL_OFF} style={market === 'US' ? { background: '#1a1a1a', color: '#fff' } : { background: '#ebe9e3', color: '#1a1a1a' }}>US</button>
        <button onClick={() => setMarket('BR')} className={market === 'BR' ? PILL_ON : PILL_OFF} style={market === 'BR' ? { background: '#1a1a1a', color: '#fff' } : { background: '#ebe9e3', color: '#1a1a1a' }}>BR</button>
      </div>
      <div className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 mb-6" style={{ background: 'white', border: '0.8px solid #e5e3de' }}>
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1" style={{ color: '#9ca3af' }}>PERÍODO</span>
        {PRESETS.map((p) => {
          const active = !applied && period === p;
          return <button key={p} onClick={() => { setApplied(null); setPeriod(p); }} className={active ? PILL_ON : PILL_OFF} style={active ? { background: '#1a1a1a', color: '#fff' } : { background: '#ebe9e3', color: '#1a1a1a' }}>{p}</button>;
        })}
        <span className="h-7 w-px mx-1" style={{ background: '#e5e3de' }} />
        <input type="date" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} className="rounded-full px-4 py-2 text-[13px] bg-white" style={{ border: `1px solid ${applied ? '#ec4899' : '#e5e3de'}` }} />
        <span className="text-[13px]" style={{ color: '#6b7280' }}>até</span>
        <input type="date" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} className="rounded-full px-4 py-2 text-[13px] bg-white" style={{ border: `1px solid ${applied ? '#ec4899' : '#e5e3de'}` }} />
        <button onClick={applyDates} className={PILL_ON} style={{ background: '#1a1a1a', color: '#fff' }}>Aplicar</button>
        {data && <span className="text-[11px] italic ml-auto" style={{ color: '#9ca3af' }}>{data.start} → {data.end} · {data.gran}</span>}
      </div>

      {err && <div className="card p-4" style={{ color: '#b3382f', background: '#fdeceb', border: '1px solid #f3c7c3', borderRadius: 12 }}>Erro: {err}</div>}
      {loading && <div className="card p-8 text-center" style={{ color: '#6b7280' }}>Carregando sessões…</div>}

      {!loading && !err && t && data && (
        <div className="space-y-8">
          {/* 1) Visão geral */}
          <section>
            <SectionTitle>🌐 Visão geral</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <Kpi label="Sessões" value={fmtN(t.sessions)} accent="#5d4ec5" />
              <Kpi label="Conversão" value={fmtP(t.convRate, 2)} accent="#16A34A" />
              <Kpi label="Bounce rate" value={fmtP(t.bounceRate)} accent="#dc2626" />
              <Kpi label="Add-to-cart" value={fmtP(t.cartRate)} accent="#E8722A" />
              <Kpi label="Chegou ao checkout" value={fmtP(t.checkoutRate)} accent="#3b82f6" />
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
              <ChartCard title="Sessões ao longo do tempo"><BarLineChart title="" data={sessionPts} color="#5d4ec5" unit="number" market={market} height={220} bare /></ChartCard>
              <ChartCard title="Taxa de conversão (%)"><BarLineChart title="" data={convPts} color="#16A34A" unit="percent" market={market} height={220} bare /></ChartCard>
            </div>
            {/* Funil */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <FunnelStep label="Sessões" value={t.sessions} pct={100} color="#5d4ec5" />
              <FunnelStep label="Add-to-cart" value={t.cart} pct={t.cartRate} color="#E8722A" />
              <FunnelStep label="Checkout" value={t.checkout} pct={t.checkoutRate} color="#3b82f6" />
              <FunnelStep label="Pedido" value={t.completed} pct={t.convRate} color="#16A34A" />
            </div>
          </section>

          {/* 2) Sessões por página */}
          <section>
            <SectionTitle>📄 Sessões por página</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              {data.byType.map((r) => (
                <div key={r.key} className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #ece9e2' }}>
                  <div className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>{r.key}</div>
                  <div className="font-num text-[20px] font-bold" style={{ color: '#1A1A1A' }}>{fmtN(r.sessions)}</div>
                  <div className="text-[11px]" style={{ color: '#16A34A' }}>conv {fmtP(r.convRate, 2)}</div>
                </div>
              ))}
            </div>
            {(() => {
              const slice = data.allPages.slice((pageNum - 1) * PER_PAGE, pageNum * PER_PAGE);
              return (
                <>
                  <Table title={`Todas as páginas com sessões · ${fmtN(data.allPages.length)} páginas`} rows={slice} keyLabel="Página" />
                  <Pager page={pageNum} total={data.allPages.length} perPage={PER_PAGE} onChange={setPageNum} />
                </>
              );
            })()}
          </section>

          {/* 3) Por coleção */}
          <section>
            <SectionTitle>🗂️ Por coleção</SectionTitle>
            {data.byCollection.length === 0
              ? <div className="text-[13px]" style={{ color: '#6b7280' }}>Sem sessões em páginas de coleção no período.</div>
              : <Table title="Coleções por sessões (landing em /collections/)" rows={data.byCollection} keyLabel="Coleção" />}
          </section>

          {/* 4) Share de sessões por canal */}
          <section>
            <SectionTitle>📡 Share de sessões por canal</SectionTitle>
            <ChannelShare data={data.channelShare} />
            <div className="grid lg:grid-cols-2 gap-4 mt-4">
              <DimTable title="Origem bruta (referrer name)" rows={data.byReferrer} />
              <DimTable title="UTM source (bruto)" rows={data.byUtm} />
            </div>
          </section>

          <p className="text-[11px]" style={{ color: '#9ca3af' }}>
            Fonte: Shopify Analytics (ShopifyQL <code>sessions</code>). Device, país e região não são expostos por esse dataset.
          </p>
        </div>
      )}
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-semibold mb-3" style={{ color: '#1A1A1A' }}>{children}</h2>;
}
function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #ece9e2' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#9ca3af' }}>{label}</div>
      <div className="font-num text-[22px] font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: '0.8px solid #e5e3de' }}>
      <div className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>{title}</div>
      {children}
    </div>
  );
}
function FunnelStep({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #ece9e2', borderTop: `3px solid ${color}` }}>
      <div className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>{label}</div>
      <div className="font-num text-[20px] font-bold" style={{ color: '#1A1A1A' }}>{fmtN(value)}</div>
      <div className="text-[11px]" style={{ color }}>{fmtP(pct, pct < 10 ? 2 : 1)}</div>
    </div>
  );
}
function Table({ title, rows, keyLabel }: { title: string; rows: AggRow[]; keyLabel: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: '0.8px solid #e5e3de' }}>
      <div className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>{keyLabel}</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Sessões</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Add-cart</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Checkout</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Conversão</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Bounce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: '1px solid #f1efe8' }}>
                <td style={{ padding: '6px 8px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.key}>{r.key}</td>
                <td className="font-num" style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{fmtN(r.sessions)}</td>
                <td className="font-num" style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>{fmtP(r.cartRate)}</td>
                <td className="font-num" style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>{fmtP(r.checkoutRate)}</td>
                <td className="font-num" style={{ textAlign: 'right', padding: '6px 8px', color: '#16A34A', fontWeight: 600 }}>{fmtP(r.convRate, 2)}</td>
                <td className="font-num" style={{ textAlign: 'right', padding: '6px 8px', color: '#dc2626' }}>{fmtP(r.bounceRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Pager({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / perPage));
  if (last <= 1) return null;
  const btn = (disabled: boolean): React.CSSProperties => ({ border: '1px solid #e5e3de', background: '#fff', borderRadius: 8, padding: '4px 12px', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' });
  return (
    <div className="flex items-center justify-center gap-3 mt-3 text-[13px]">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} style={btn(page <= 1)}>‹ Anterior</button>
      <span style={{ color: '#6b7280' }}>Página <b>{page}</b> de <b>{last}</b> · {fmtN(total)} páginas</span>
      <button disabled={page >= last} onClick={() => onChange(page + 1)} style={btn(page >= last)}>Próxima ›</button>
    </div>
  );
}

const CH_COLOR: Record<string, string> = { meta: '#1877F2', 'google ads': '#EA4335', 'orgânico': '#16A34A', klaviyo: '#5d4ec5', direto: '#6b7280', attentive: '#A855F7', criteo: '#F59E0B', shopmy: '#EC4899', awin: '#0EA5E9', 'agent.shop': '#14B8A6', outros: '#9ca3af' };
function ChannelShare({ data }: { data: { total: number; channels: ChannelRow[] } }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: '0.8px solid #e5e3de' }}>
      <div className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: '#6b7280' }}>Participação por canal · {fmtN(data.total)} sessões</div>
      <div className="space-y-2">
        {data.channels.map((c) => {
          const col = CH_COLOR[c.channel] || '#9ca3af';
          return (
            <div key={c.channel} className="flex items-center gap-3">
              <div style={{ width: 92, fontSize: 12, fontWeight: 600, color: '#1A1A1A', textTransform: 'capitalize' }}>{c.channel}</div>
              <div style={{ flex: 1, height: 18, borderRadius: 4, background: '#f1efe8' }}>
                <div style={{ height: 18, borderRadius: 4, width: `${Math.min(100, c.share)}%`, background: col, minWidth: c.share > 0 ? 4 : 0 }} />
              </div>
              <div className="font-num" style={{ width: 56, textAlign: 'right', fontSize: 13, fontWeight: 700, color: col }}>{fmtP(c.share, 1)}</div>
              <div className="font-num" style={{ width: 90, textAlign: 'right', fontSize: 12, color: '#6b7280' }}>{fmtN(c.sessions)}</div>
              <div className="font-num" style={{ width: 78, textAlign: 'right', fontSize: 12, color: '#16A34A' }}>conv {fmtP(c.convRate, 2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DimTable({ title, rows }: { title: string; rows: DimRow[] }) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: '0.8px solid #e5e3de' }}>
      <div className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>{title}</div>
      <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: '1px solid #f1efe8' }}>
              <td style={{ padding: '5px 6px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.key}>{r.key}</td>
              <td style={{ padding: '5px 6px', width: '40%' }}>
                <div style={{ height: 6, borderRadius: 3, background: '#ece9e2' }}><div style={{ height: 6, borderRadius: 3, width: `${(r.sessions / max) * 100}%`, background: '#5d4ec5' }} /></div>
              </td>
              <td className="font-num" style={{ textAlign: 'right', padding: '5px 6px', fontWeight: 600 }}>{fmtN(r.sessions)}</td>
              <td className="font-num" style={{ textAlign: 'right', padding: '5px 6px', color: '#16A34A' }}>{fmtP(r.convRate, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

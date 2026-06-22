'use client';
// Cassia 2026-06-21: Aba Funil — dados DIRETO do Shopify (ShopifyQL) + split de pagamento (orders).
// FiltersBar padrão (URL-driven). Funil sessões→carrinho→checkout→pedido + share de cada etapa,
// série por dia/semana/mês (granularidade automática pelo período), split PIX/cartão/PIX-pendente,
// e funil de HOJE em tempo real com alerta de queda anormal por etapa.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Header from '@/components/main-dashboard/Header';
import type { PeriodKey } from '@/lib/main-dashboard/types';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import MultiLineChart, { type Series } from '@/components/klaviyo/MultiLineChart';

type Market = 'US' | 'BR';

interface FunnelPoint { date: string; sessions: number; addToCart: number; reachedCheckout: number; completed: number; }
interface Bundle {
  available: boolean; market: Market; since: string; until: string; gran: string;
  series: FunnelPoint[];
  totals: { sessions: number; addToCart: number; reachedCheckout: number; completed: number } | null;
  shares: { cartFromSessions: number; checkoutFromCart: number; completedFromCheckout: number; overallCvr: number } | null;
  payment: { cards: Array<{ brand: string; orders: number }>; cardTotal: number; pixPaid: number; pixPending: number; other: number; hasPix: boolean };
  today: { sessions: number; addToCart: number; reachedCheckout: number; completed: number } | null;
  alerts: Array<{ step: string; todayRate: number; periodRate: number; dropPct: number }>;
  shareSeries: Array<{ date: string; cart: number; checkout: number; pedido: number; cvr: number }>;
  context: Array<{ date: string; sessions: number; mediaSessions: number; crmSessions: number; addToCart: number; checkout: number; paidOrders: number }>;
  mediaSessTotal: number;
  crmSessTotal: number;
  paidOrdersTotal: number;
  error?: string;
}

function presetRange(key: PeriodKey): { since: string; until: string } {
  const DAY = 86400000;
  const end = new Date(Date.now() - DAY);
  const days = ({ '1d': 1, '7d': 7, '14d': 14, '28d': 28, '60d': 60, '90d': 90, '3M': 90, '6M': 180, '12M': 365 } as Record<string, number>)[key] ?? 28;
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { since: iso(start), until: iso(end) };
}

const fmtN = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v || 0));
const fmtP = (v: number, d = 1) => `${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

const BRAND_COLORS: Record<string, string> = {
  Visa: '#1a1f71', Mastercard: '#eb001b', 'American Express': '#2e77bc', Elo: '#00a4e0',
  Discover: '#f76600', Hipercard: '#b3131b', 'Diners Club': '#0079be', JCB: '#0b4ea2', UnionPay: '#e21836',
};

const STAGES = [
  { key: 'sessions', label: 'Sessões', color: '#5d4ec5' },
  { key: 'addToCart', label: 'Add ao carrinho', color: '#0ea5e9' },
  { key: 'reachedCheckout', label: 'Checkout (info pgto)', color: '#f59e0b' },
  { key: 'completed', label: 'Pedido concluído', color: '#10b981' },
] as const;

export default function FunnelDashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const market = (params.get('market') || 'US') as Market;
  const periodParam = (params.get('period') || '28d') as PeriodKey;
  const urlFrom = params.get('from');
  const urlTo = params.get('to');
  const isCustom = !!(urlFrom && urlTo);
  const { since, until } = isCustom ? { since: urlFrom!, until: urlTo! } : presetRange(periodParam);
  const daysCount = Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1;

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) { if (v == null) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // "Atualizar agora" → re-fetch

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    fetch(`/api/funnel/${market}?since=${since}&until=${until}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Bundle) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [market, since, until, nonce]);

  const t = data?.totals;
  const sh = data?.shares;
  const maxStage = t ? Math.max(t.sessions, 1) : 1;

  const seriesFor = (key: keyof FunnelPoint): BarPoint[] =>
    (data?.series ?? []).map((p) => ({ date: p.date, value: Number(p[key]) || 0 }));
  const cvrSeries: BarPoint[] = (data?.series ?? []).map((p) => ({ date: p.date, value: p.sessions > 0 ? (p.completed / p.sessions) * 100 : 0 }));

  const ctx = data?.context ?? [];
  const ctxDates = ctx.map((p) => p.date);

  // #2: sessões site × mídia × CRM (todas em contagem de sessões — comparáveis direto, sem índice).
  const mediaHas = ctx.some((p) => p.mediaSessions > 0);
  const crmHas = ctx.some((p) => p.crmSessions > 0);
  const sessLines: Series[] = [
    { label: 'Sessões site', values: ctx.map((p) => p.sessions), color: '#5d4ec5' },
    { label: 'Sessões mídia', values: ctx.map((p) => p.mediaSessions), color: '#e11d48' },
    { label: 'Sessões CRM', values: ctx.map((p) => p.crmSessions), color: '#0ea5e9' },
  ];

  // #3: add ao carrinho × checkout × pedidos concluídos (PAGOS).
  const orderLines: Series[] = [
    { label: 'Add ao carrinho', values: ctx.map((p) => p.addToCart), color: '#0ea5e9' },
    { label: 'Checkout', values: ctx.map((p) => p.checkout), color: '#f59e0b' },
    { label: 'Pedidos pagos', values: ctx.map((p) => p.paidOrders), color: '#10b981' },
  ];

  const pay = data?.payment;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <Header
        market={market}
        period={periodParam}
        customStart={urlFrom ?? undefined}
        customEnd={urlTo ?? undefined}
        isCustom={isCustom}
        onMarketChange={(m) => setParams({ market: m })}
        onPeriodChange={(p) => setParams({ period: p, from: null, to: null })}
        onCustomRange={(s, e) => setParams({ from: s, to: e, period: null })}
        onRefresh={() => setNonce((n) => n + 1)}
        onExportPdf={() => { if (typeof window !== 'undefined') window.print(); }}
        refreshing={loading}
        periodRange={{ start: since, end: until, days: daysCount }}
        title="Funil de Conversão"
      />

      {loading && <div className="card text-center py-8" style={{ color: 'var(--ink-soft)' }}>Carregando funil…</div>}
      {err && <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm">Erro: {err}</div>}
      {data && !data.available && (
        <div className="card" style={{ background: 'rgba(255,92,108,0.10)', border: '1px solid rgba(255,92,108,0.35)', color: '#c0334a' }}>
          <strong>Dados indisponíveis.</strong> O Shopify (ShopifyQL) não respondeu. {data.error}
        </div>
      )}

      {data && data.available && t && sh && (
        <div className="space-y-6">
          {/* ALERTA tempo real */}
          {data.alerts.length > 0 && (
            <div className="card" style={{ background: 'rgba(225,29,72,0.08)', border: '1px solid rgba(225,29,72,0.4)' }}>
              <div className="flex items-center gap-2 mb-2 font-semibold" style={{ color: '#e11d48' }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: '#e11d48', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                ⚠ Possível problema no funil HOJE
              </div>
              <div className="space-y-1 text-[12px]" style={{ color: 'var(--ink)' }}>
                {data.alerts.map((a) => (
                  <div key={a.step}>
                    <strong>{a.step}</strong>: hoje {fmtP(a.todayRate)} vs média {fmtP(a.periodRate)} do período — queda de <strong style={{ color: '#e11d48' }}>{fmtP(a.dropPct, 0)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tempo real — funil de HOJE */}
          {data.today && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <span style={{ width: 8, height: 8, borderRadius: 99, background: '#10b981', display: 'inline-block' }} />
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>Hoje · tempo real</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {STAGES.map((s, i) => {
                  const td = data.today as any;
                  const val = Number(td[s.key]) || 0;
                  const prev = i === 0 ? val : Number(td[STAGES[i - 1].key]) || 0;
                  const sh = i === 0 ? null : prev > 0 ? (val / prev) * 100 : 0;
                  const ofSess = data.today!.sessions > 0 ? (val / data.today!.sessions) * 100 : 0;
                  return (
                    <div key={s.key} className="rounded-lg p-3" style={{ background: 'var(--paper)' }}>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{s.label}</div>
                      <div className="font-num font-bold text-[20px]" style={{ color: s.color }}>{fmtN(val)}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                        {i === 0 ? '100% das sessões' : `${fmtP(sh as number)} da etapa ant. · ${fmtP(ofSess)} das sessões`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FUNIL do período + share de cada etapa */}
          <div className="card">
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Funil · {data.since} → {data.until}</h3>
            <p className="text-[11px] mb-4" style={{ color: 'var(--ink-soft)' }}>Largura ∝ volume · % = conversão da etapa anterior</p>
            <div className="space-y-2">
              {STAGES.map((s, i) => {
                const val = (t as any)[s.key] as number;
                const prev = i === 0 ? val : (t as any)[STAGES[i - 1].key] as number;
                const stepShare = i === 0 ? 100 : prev > 0 ? (val / prev) * 100 : 0;
                const ofSessions = (val / maxStage) * 100;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <div className="w-32 lg:w-40 shrink-0 text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>{s.label}</div>
                    <div className="flex-1 h-8 rounded-md relative" style={{ background: 'var(--paper)' }}>
                      <div className="h-8 rounded-md flex items-center px-3" style={{ width: `${Math.max(ofSessions, 6)}%`, background: s.color, minWidth: 60 }}>
                        <span className="text-[12px] font-bold text-white tabular-nums">{fmtN(val)}</span>
                      </div>
                    </div>
                    <div className="w-16 shrink-0 text-right text-[12px] tabular-nums" style={{ color: i === 0 ? 'var(--ink-muted)' : 'var(--ink-soft)' }}>
                      {i === 0 ? `${fmtN(t.sessions)}` : fmtP(stepShare)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <Stat label="Add carrinho / sessões" value={fmtP(sh.cartFromSessions)} />
              <Stat label="Checkout / carrinho" value={fmtP(sh.checkoutFromCart)} />
              <Stat label="Pedido / checkout" value={fmtP(sh.completedFromCheckout)} />
              <Stat label="CVR geral (pedido/sessão)" value={fmtP(sh.overallCvr, 2)} color="#10b981" />
            </div>
          </div>

          {/* OVER-TIME por etapa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card"><BarLineChart title="Sessões" data={seriesFor('sessions')} color="#5d4ec5" unit="number" market={market} height={200} /></div>
            <div className="card"><BarLineChart title="CVR geral (%)" data={cvrSeries} color="#10b981" unit="percent" market={market} height={200} /></div>
            <div className="card"><BarLineChart title="Add ao carrinho" data={seriesFor('addToCart')} color="#0ea5e9" unit="number" market={market} height={200} /></div>
            <div className="card"><BarLineChart title="Checkout (info de pagamento)" data={seriesFor('reachedCheckout')} color="#f59e0b" unit="number" market={market} height={200} /></div>
            <div className="card"><BarLineChart title="Pedidos concluídos" data={seriesFor('completed')} color="#10b981" unit="number" market={market} height={200} /></div>
          </div>

          {/* #2 — Sessões site × mídia × CRM */}
          <div className="card">
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Sessões site × mídia × CRM</h3>
            <p className="text-[11px] mb-3" style={{ color: 'var(--ink-soft)' }}>
              Sessões totais do site vs. originadas de mídia (Google + Criteo + Meta) e de CRM ({market === 'BR' ? 'e-mail + SMS + WhatsApp' : 'e-mail + SMS'}) — classificadas por UTM no Shopify.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat label="Sessões site" value={fmtN((data.totals!).sessions)} color="#5d4ec5" />
              <Stat label="Sessões mídia" value={mediaHas ? fmtN(data.mediaSessTotal) : '—'} color="#e11d48" />
              <Stat label="Sessões CRM" value={crmHas ? fmtN(data.crmSessTotal) : '—'} color="#0ea5e9" />
            </div>
            {ctxDates.length > 1 ? (
              <MultiLineChart title="" dates={ctxDates} series={sessLines} unit="number" market={market} height={260} />
            ) : (
              <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>Período curto demais para a série temporal.</p>
            )}
          </div>

          {/* #3 — Add ao carrinho × Checkout × Pedidos pagos */}
          <div className="card">
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Add ao carrinho × Checkout × Pedidos pagos</h3>
            <p className="text-[11px] mb-3" style={{ color: 'var(--ink-soft)' }}>
              Volume de cada etapa final do funil por período. Pedidos pagos = pedidos com pagamento confirmado (financial_status &ldquo;paid&rdquo;), do Shopify.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat label="Add ao carrinho" value={fmtN((data.totals!).addToCart)} color="#0ea5e9" />
              <Stat label="Checkout" value={fmtN((data.totals!).reachedCheckout)} color="#f59e0b" />
              <Stat label="Pedidos pagos" value={data.paidOrdersTotal > 0 ? fmtN(data.paidOrdersTotal) : '—'} color="#10b981" />
            </div>
            {ctxDates.length > 1 ? (
              <MultiLineChart title="" dates={ctxDates} series={orderLines} unit="number" market={market} height={260} />
            ) : (
              <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>Período curto demais para a série temporal.</p>
            )}
          </div>

          {/* PAGAMENTO */}
          {pay && (
            <div className="card">
              <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Pagamento · pedidos no período</h3>
              <p className="text-[11px] mb-3" style={{ color: 'var(--ink-soft)' }}>Cartão por bandeira{pay.hasPix ? ' · PIX (Brasil)' : ''} · fonte: transações Shopify</p>

              {/* Cartão por bandeira */}
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--ink-muted)' }}>💳 Cartão · {fmtN(pay.cardTotal)} pedidos</div>
              {pay.cards.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                  {pay.cards.map((c) => {
                    const total = pay.cardTotal || 1;
                    return (
                      <div key={c.brand} className="rounded-lg p-2.5" style={{ background: 'var(--paper)', borderLeft: `3px solid ${BRAND_COLORS[c.brand] ?? '#9ca3af'}` }}>
                        <div className="text-[11px] font-semibold" style={{ color: 'var(--ink)' }} data-no-translate="true">{c.brand}</div>
                        <div className="font-num font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{fmtN(c.orders)}</div>
                        <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{fmtP((c.orders / total) * 100, 0)}</div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-[12px] mb-4" style={{ color: 'var(--ink-muted)' }}>Sem dados de cartão no período.</p>}

              {/* PIX — só Brasil */}
              {pay.hasPix && (
                <>
                  <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--ink-muted)' }}>⚡ PIX (Brasil)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Stat label="PIX pago" value={fmtN(pay.pixPaid)} color="#10b981" />
                    <Stat label="PIX pendente (não pago)" value={fmtN(pay.pixPending)} color="#f59e0b" />
                    {pay.other > 0 && <Stat label="Outros" value={fmtN(pay.other)} />}
                  </div>
                </>
              )}
              {!pay.hasPix && pay.other > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Stat label="Outros" value={fmtN(pay.other)} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--paper)' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</div>
      <div className="font-num font-bold text-[16px] mt-0.5" style={{ color: color ?? 'var(--ink)' }}>{value}</div>
    </div>
  );
}

'use client';

// Dashboard de Google Ads (nativo) — Cassia 2026-06-21. Espelha o de Meta Ads.
// Fonte: /api/google-ads/dashboard (BQ gold.all_channels_daily, channel=google_ads).
// KPIs + séries diárias + por tipo de campanha (PMax/Shopping/Search/Demand Gen) + tabela de campanhas.

import { useEffect, useMemo, useState } from 'react';
import KpiCard from '@/components/meta-ads-native/KpiCard';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import type { GoogleAdsBundle } from '@/lib/google-ads-native/queries';

type Market = 'US' | 'BR';
type PeriodKey = '1d' | '7d' | '14d' | '28d' | '3M' | '6M' | '12M';
const PRESETS: PeriodKey[] = ['1d', '7d', '14d', '28d', '3M', '6M', '12M'];
const PILL_BASE = 'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const PILL_ACTIVE = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-5 py-1.5 sm:py-2`;
const PILL_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-5 py-1.5 sm:py-2`;
const MKT_ACTIVE = `${PILL_BASE} bg-[#ec4899] text-white px-3 sm:px-4 py-1.5`;
const MKT_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-4 py-1.5`;

function periodLabel(p: PeriodKey) { return p === '1d' ? 'D-1' : p.toUpperCase(); }
function ptLabel(p: PeriodKey) {
  return { '1d': 'Ontem', '7d': 'Últimos 7 dias', '14d': 'Últimos 14 dias', '28d': 'Últimos 28 dias', '3M': 'Últimos 3 meses', '6M': 'Últimos 6 meses', '12M': 'Últimos 12 meses' }[p];
}
function yesterday(market: Market): string {
  const tz = market === 'US' ? 'America/New_York' : 'America/Sao_Paulo';
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
}

export default function GoogleAdsDashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<PeriodKey>('28d');
  const [isCustom, setIsCustom] = useState(false);
  const [cStart, setCStart] = useState(''); const [cEnd, setCEnd] = useState('');
  const [dStart, setDStart] = useState(''); const [dEnd, setDEnd] = useState('');
  const [data, setData] = useState<GoogleAdsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'spend' | 'roas'>('spend');

  const rangeQS = isCustom ? `start=${cStart}&end=${cEnd}`
    : period === '1d' ? (() => { const y = yesterday(market); return `start=${y}&end=${y}`; })()
    : `period=${period}`;

  useEffect(() => {
    let cancel = false; setLoading(true);
    fetch(`/api/google-ads/dashboard?market=${market}&${rangeQS}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j: GoogleAdsBundle & { error?: string }) => {
        if (cancel || j.error) { setLoading(false); return; }
        setData(j);
        if (!isCustom) { setDStart(j.start); setDEnd(j.end); }
        setLoading(false);
      }).catch(() => setLoading(false));
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, rangeQS]);

  function applyDates() {
    if (!dStart || !dEnd) { alert('Selecione data inicial e final.'); return; }
    if (dStart > dEnd) { alert('Data inicial deve ser anterior ou igual à final.'); return; }
    setCStart(dStart); setCEnd(dEnd); setIsCustom(true);
  }
  const activeLabel = isCustom ? `${cStart} → ${cEnd}` : ptLabel(period);

  const mkt = market;
  const campaigns = useMemo(() => {
    const c = [...(data?.campaigns || [])];
    return sortBy === 'roas' ? c.sort((a, b) => b.roas - a.roas) : c.sort((a, b) => b.spend - a.spend);
  }, [data, sortBy]);
  const fmtMoney = (v: number) => `${market === 'US' ? '$' : 'R$'}${Math.round(v).toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')}`;
  const fmtNum = (v: number) => Math.round(v).toLocaleString(market === 'US' ? 'en-US' : 'pt-BR');

  const typeColor: Record<string, string> = { 'Performance Max': '#5d4ec5', 'Shopping': '#16A34A', 'Search': '#2563eb', 'Demand Gen / Vídeo': '#d97706', 'Outros': '#9ca3af' };

  return (
    <main className="main-dashboard-root mx-auto max-w-[1480px] px-4 py-6 lg:px-8">
      <div className="pt-4 pb-2">
        <h1 className="font-display font-bold leading-tight" style={{ fontSize: 36, color: 'var(--ink)', letterSpacing: '-0.025em' }}>Larroudé · Google Ads</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
          Performance Max · Shopping · Search · Demand Gen — via BigQuery (gold.all_channels_daily)
          {data && <> · {data.start} → {data.end}</>}
        </p>
      </div>

      {/* Market */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(['US', 'BR'] as const).map((m) => (
          <button key={m} onClick={() => { setMarket(m); setIsCustom(false); }} className={market === m ? MKT_ACTIVE : MKT_INACTIVE}>
            <span className="text-[10px] font-bold opacity-70 mr-1.5">{m}</span>{m === 'US' ? 'United States' : 'Brasil'}
          </button>
        ))}
      </div>

      {/* Filtro de período */}
      <div className="px-5 py-3 rounded-2xl flex flex-wrap items-center gap-3 mb-6" style={{ background: 'white', border: '0.8px solid #e5e3de' }}>
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold mr-1" style={{ color: '#9ca3af' }}>PERÍODO</span>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => { setPeriod(p); setIsCustom(false); }} className={period === p && !isCustom ? PILL_ACTIVE : PILL_INACTIVE}>{periodLabel(p)}</button>
          ))}
        </div>
        <div className="h-7 w-px mx-1" style={{ background: '#e5e3de' }} />
        <input type="date" value={dStart} onChange={(e) => setDStart(e.target.value)} className="rounded-full px-4 py-2 text-[13px] bg-white font-medium" style={{ border: `1px solid ${isCustom ? '#ec4899' : '#e5e3de'}` }} />
        <span className="text-[13px]" style={{ color: '#6b7280' }}>até</span>
        <input type="date" value={dEnd} onChange={(e) => setDEnd(e.target.value)} className="rounded-full px-4 py-2 text-[13px] bg-white font-medium" style={{ border: `1px solid ${isCustom ? '#ec4899' : '#e5e3de'}` }} />
        <button onClick={applyDates} className={PILL_ACTIVE} title="Aplicar intervalo">Aplicar</button>
        <span className="ml-auto text-[13px] italic px-2" style={{ color: '#9ca3af' }}>{activeLabel}</span>
      </div>

      {loading && !data && <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Carregando dados do Google Ads…</div>}

      {data && (
        <>
          {/* KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard kpi={data.kpis.spend} currency={data.currency} />
            <KpiCard kpi={data.kpis.value} currency={data.currency} hint="Valor de conversão (Google)" />
            <KpiCard kpi={data.kpis.roas} currency={data.currency} hint="Valor / Investimento" />
            <KpiCard kpi={data.kpis.conversions} currency={data.currency} />
            <KpiCard kpi={data.kpis.cpc} currency={data.currency} hint="Investimento / Cliques" />
            <KpiCard kpi={data.kpis.cpa} currency={data.currency} hint="Investimento / Conversões" />
          </section>

          {/* Por tipo de campanha */}
          <div className="card-title">POR TIPO DE CAMPANHA</div>
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {data.byType.map((t) => (
              <div key={t.name} className="card p-4" style={{ borderTop: `3px solid ${typeColor[t.name] || '#9ca3af'}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A' }}>{t.name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginTop: 4 }}>{t.roas.toFixed(2)}x <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.04em' }}>ROAS</span></div>
                <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2 }}>{fmtMoney(t.spend)} · {fmtNum(t.conversions)} conv · {fmtMoney(t.value)}</div>
              </div>
            ))}
          </section>

          {/* Séries diárias */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <BarLineChart title="INVESTIMENTO" data={data.series.spend as BarPoint[]} color="#1f2d44" unit="currency" market={mkt} height={240} />
            <BarLineChart title="VALOR DE CONVERSÃO" data={data.series.value as BarPoint[]} color="#16A34A" unit="currency" market={mkt} height={240} />
            <BarLineChart title="ROAS" data={data.series.roas as BarPoint[]} color="#5d4ec5" unit="multiple" market={mkt} height={240} />
            <BarLineChart title="CONVERSÕES" data={data.series.conversions as BarPoint[]} color="#2563eb" unit="number" market={mkt} height={240} />
            <BarLineChart title="CLIQUES" data={data.series.clicks as BarPoint[]} color="#0891b2" unit="number" market={mkt} height={240} />
            <BarLineChart title="CTR" data={data.series.ctr as BarPoint[]} color="#7c3aed" unit="percent" market={mkt} height={240} />
            <BarLineChart title="CPC" data={data.series.cpc as BarPoint[]} color="#c2410c" unit="currency" market={mkt} height={240} />
          </section>

          {/* Tabela de campanhas */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <span className="card-title" style={{ marginBottom: 0 }}>CAMPANHAS ({data.campaigns.length})</span>
            <div className="flex items-center rounded-full overflow-hidden" style={{ border: '1px solid #e5e3de' }}>
              <button onClick={() => setSortBy('spend')} className="px-3 py-1.5 text-[12px] font-semibold" style={{ background: sortBy === 'spend' ? '#1a1a1a' : '#fff', color: sortBy === 'spend' ? '#fff' : '#1a1a1a' }}>Investimento</button>
              <button onClick={() => setSortBy('roas')} className="px-3 py-1.5 text-[12px] font-semibold" style={{ background: sortBy === 'roas' ? '#1a1a1a' : '#fff', color: sortBy === 'roas' ? '#fff' : '#1a1a1a' }}>ROAS</button>
            </div>
          </div>
          <div className="card p-2 overflow-x-auto mb-8">
            <table className="w-full text-[12px]" style={{ minWidth: 720 }}>
              <thead>
                <tr className="text-left" style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>
                  <th className="py-1.5 px-2">Campanha</th><th className="py-1.5 px-2">Tipo</th>
                  <th className="py-1.5 px-2 text-right">Invest.</th><th className="py-1.5 px-2 text-right">Cliques</th>
                  <th className="py-1.5 px-2 text-right">CTR</th><th className="py-1.5 px-2 text-right">Conv.</th>
                  <th className="py-1.5 px-2 text-right">Valor</th><th className="py-1.5 px-2 text-right">ROAS</th><th className="py-1.5 px-2 text-right">CPA</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.name} style={{ borderTop: '1px solid #f0ece4' }}>
                    <td className="py-1.5 px-2 font-medium" style={{ color: '#1A1A1A' }} data-no-translate="true">{c.name}</td>
                    <td className="py-1.5 px-2"><span style={{ fontSize: 10, fontWeight: 600, color: typeColor[c.type] || '#9ca3af' }}>{c.type}</span></td>
                    <td className="py-1.5 px-2 text-right font-num">{fmtMoney(c.spend)}</td>
                    <td className="py-1.5 px-2 text-right font-num">{fmtNum(c.clicks)}</td>
                    <td className="py-1.5 px-2 text-right font-num">{c.ctr.toFixed(1)}%</td>
                    <td className="py-1.5 px-2 text-right font-num">{fmtNum(c.conversions)}</td>
                    <td className="py-1.5 px-2 text-right font-num">{fmtMoney(c.value)}</td>
                    <td className="py-1.5 px-2 text-right font-num" style={{ fontWeight: 700, color: c.roas >= 3 ? '#16A34A' : c.roas >= 1 ? '#1A1A1A' : '#dc2626' }}>{c.roas.toFixed(2)}x</td>
                    <td className="py-1.5 px-2 text-right font-num">{fmtMoney(c.cpa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="mt-2 mb-6 text-xs text-center" style={{ color: '#6b7280' }}>
            Larroudé · Google Ads · {market} · BigQuery gold.all_channels_daily · atualizado {new Date(data.generatedAt).toLocaleString(market === 'US' ? 'en-US' : 'pt-BR')}
          </footer>
        </>
      )}
    </main>
  );
}

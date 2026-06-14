'use client';
// Cassia 2026-06-14: clone 1:1 do larroude-dash-meta — internalizado no lpos.
// Source: https://github.com/cassiafernandes-larroude/larroude-dash-meta
import { useCallback, useEffect, useState } from 'react';
import Header from './Header';
import KpiCard from './KpiCard';
import Funnel from './Funnel';
import GenderDonut from './GenderDonut';
import BarRanking from './charts/BarRanking';
import ScatterRoas from './charts/ScatterRoas';
import AgeGroupBar from './charts/AgeGroupBar';
import ReachFrequency from './charts/ReachFrequency';
import MonthlyRoas from './charts/MonthlyRoas';
import ObjectiveSpend from './charts/ObjectiveSpend';
import RegionList from './charts/RegionMap';
import PerformanceByAge from './PerformanceByAge';
import CampaignsTable from './CampaignsTable';
import AdsTable from './AdsTable';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/meta-ads-native/format';
import type { DashboardData, DateRange, Period, Region } from '@/lib/meta-ads-native/types';
// Cassia 2026-06-14: usar mesmos charts de barra do Main Dashboard pra padronizar visual
import DailyBarChart from '@/components/main-dashboard/DailyBarChart';
import DailyMultiBarChart from '@/components/main-dashboard/DailyMultiBarChart';
import DuplicatePurchasesDisclaimer from '@/components/shared/DuplicatePurchasesDisclaimer';
import CreativesTab from './CreativesTab';

// Converte TimeSeriesPoint {date, value} -> DailyPoint {date, value, inPeriod}
// Cassia 2026-06-14: arredonda valores pra evitar decimais excessivos no chart label
const toDailyPoints = (pts: { date: string; value: number }[] = [], opts?: { divideBy?: number; roundTo?: number }) =>
  pts.map(p => {
    let v = Number(p.value) || 0;
    if (opts?.divideBy) v = v / opts.divideBy;
    if (opts?.roundTo != null) {
      const factor = Math.pow(10, opts.roundTo);
      v = Math.round(v * factor) / factor;
    } else {
      v = Math.round(v);
    }
    return { date: p.date, value: v, inPeriod: true };
  });

const currencyFor = (r: Region) => (r === 'BR' ? 'BRL' : 'USD');

export default function MetaAdsDashboard() {
  const [region, setRegion] = useState<Region>('US');
  const [period, setPeriod] = useState<Period>('28d');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ region, period });
      if (customRange && period === 'custom') {
        params.set('since', customRange.since);
        params.set('until', customRange.until);
      }
      const r = await fetch(`/api/meta-ads-native/dashboard?${params.toString()}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [region, period, customRange]);

  useEffect(() => { load(); }, [load]);

  const handleCustomRange = (range: DateRange) => {
    setCustomRange(range);
    setPeriod('custom');
  };
  const handleExportPdf = () => { window.print(); };

  const currency = currencyFor(region);
  // Cassia 2026-06-14: quando o chart daily teria > 14 barras, viramos 1 chart por linha pra
  // dar respiro visual (28d+, 3M, 6M, 12M, custom). Charts NÃO-daily (audience, ranking, idade,
  // região) continuam 2 por linha sempre — eles não têm o problema de eixo X cheio.
  const isLongPeriod = period === '28d' || period === '3M' || period === '6M' || period === '12M' || period === 'custom';
  const dailyChartsGrid = isLongPeriod ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-4';

  // Cassia 2026-06-14: tabs — Performance (default) e Creatives × Shopify
  const [activeTab, setActiveTab] = useState<'performance' | 'creatives'>('performance');

  return (
    <div>
      <Header
        region={region}
        period={period}
        lastUpdated={data?.lastUpdated}
        dateRange={data?.dateRange}
        onRegionChange={setRegion}
        onPeriodChange={setPeriod}
        onCustomRange={handleCustomRange}
        onRefresh={load}
        onExportPdf={handleExportPdf}
      />

      <div className="space-y-5">
        {error && (
          <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm">
            <strong>Error:</strong> {error}
            <div className="text-xs mt-1 text-rose-600">
              Check that META_ACCESS_TOKEN is valid and that the 4 accounts (Larroudé US, PRE-ORDER US, Larroudé Brasil, Larroude BR - Pre-Order) are accessible by the token.
            </div>
          </div>
        )}

        {!data && loading && (
          <div className="card text-center py-12 text-ink-500">Loading Meta Ads data…</div>
        )}

        {data && (
          <>
            {(period === '6M' || period === '12M' || period === '3M') && (
              <DuplicatePurchasesDisclaimer />
            )}

            {/* Cassia 2026-06-14: nav tabs — Performance / Creatives × Shopify */}
            <div className="flex items-center gap-2 mb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              {([
                { id: 'performance', label: 'Performance' },
                { id: 'creatives', label: 'Creatives × Shopify' },
              ] as const).map(t => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className="px-4 py-2 text-[13px] font-semibold transition-colors"
                    style={{
                      color: active ? 'var(--pink-deep)' : 'var(--ink-soft)',
                      borderBottom: active ? '2px solid var(--pink-deep)' : '2px solid transparent',
                      marginBottom: '-1px',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'creatives' && (
              <CreativesTab
                ads={data.ads}
                region={region}
                since={data.dateRange.since}
                until={data.dateRange.until}
                currency={currency}
              />
            )}
            {activeTab === 'performance' && (<>
            {/* Cassia 2026-06-14: section label MERCADO igual Main Dashboard */}
            <div className="flex items-center gap-2 mb-3 mt-2">
              <span
                className="inline-flex items-center text-[11px] uppercase font-bold tracking-wider"
                style={{ color: 'var(--ink-soft)' }}
              >
                <span
                  className="inline-flex items-center justify-center mr-1.5 px-1.5 rounded text-[8px] leading-4 font-bold"
                  style={{ background: '#ec4899', color: 'white' }}
                >
                  {region}
                </span>
                {region === 'US' ? 'UNITED STATES' : 'BRAZIL'}
              </span>
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#fce7f3', color: '#be185d' }}
              >
                {currency}
              </span>
            </div>

            {/* KPIs flat — 6 colunas igual ao Main Dashboard (sem sub-secoes) */}
            <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard kpi={data.kpis.spend} currency={currency} />
              <KpiCard kpi={data.kpis.revenue} currency={currency} />
              <KpiCard kpi={data.kpis.roas} hint="Revenue / Spend" />
              <KpiCard kpi={data.kpis.convRate} hint="Purchases / Clicks" />
              <KpiCard kpi={data.kpis.clicks} />
              <KpiCard kpi={data.kpis.cpc} currency={currency} hint="Spend / Clicks" />
            </section>

            {/* Audience: gender + funnel lado-a-lado */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <GenderDonut data={data.purchasesByGender} />
              <Funnel {...data.funnel} />
            </section>

            {/* Campaigns table full-width */}
            <CampaignsTable data={data.campaigns} currency={currency} />

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarRanking
                title={`Top Campaigns (${period.toUpperCase()})`}
                data={data.topCampaigns7d.map((c: any) => ({ name: c.name, value: c.spend }))}
                formatValue={(v) => formatCurrency(v, currency, true)}
              />
              <BarRanking
                title={`Campaigns with high CPC (${period.toUpperCase()})`}
                data={data.highCpcCampaigns7d.map((c: any) => ({ name: c.name, value: c.cpc }))}
                formatValue={(v) => formatCurrency(v, currency, true)}
                color="#7E22CE"
              />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AgeGroupBar data={data.ageGroupSpend} currency={currency} />
              <RegionList data={data.regionsBySpend} currency={currency} />
            </section>

            <PerformanceByAge data={data.agePerformance} currency={currency} />

            <ScatterRoas data={data.scatter} currency={currency} />

            {/* Cassia 2026-06-14: charts em barra usando DailyBarChart do Main Dashboard pra padronização */}
            {/* >14 barras (28d+) → 1 chart por linha pra dar respiro visual */}
            <section className={dailyChartsGrid}>
              <DailyMultiBarChart
                title="Spend × Revenue (daily)"
                market={region}
                series={[
                  { key: 'spend', label: 'Spend', data: toDailyPoints(data.series.spendVsRevenue.map((p: any) => ({ date: p.date, value: p.spend || 0 }))), color: '#1f2d44' },
                  { key: 'revenue', label: 'Revenue', data: toDailyPoints(data.series.spendVsRevenue.map((p: any) => ({ date: p.date, value: p.revenue || 0 }))), color: '#10b981' },
                ]}
              />
              <DailyBarChart title="Amount Spent" data={toDailyPoints(data.series.spendByDay)} color="#1f2d44" unit="currency" market={region} />
            </section>

            {isLongPeriod ? (
              <>
                <ObjectiveSpend data={data.topCampaignsByObjective} currency={currency} />
                <DailyBarChart title="ROAS · Daily" data={toDailyPoints(data.series.roas, { roundTo: 2 })} color="#3b82f6" unit="multiple" market={region} />
              </>
            ) : (
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1"><ObjectiveSpend data={data.topCampaignsByObjective} currency={currency} /></div>
                <div className="lg:col-span-2">
                  <DailyBarChart title="ROAS · Daily" data={toDailyPoints(data.series.roas, { roundTo: 2 })} color="#3b82f6" unit="multiple" market={region} />
                </div>
              </section>
            )}

            <section className={dailyChartsGrid}>
              <DailyBarChart title="Impressions" data={toDailyPoints(data.series.impressions)} color="#8b5cf6" unit="number" market={region} />
              <ReachFrequency data={data.series.reachFrequency} />
            </section>

            <section className={dailyChartsGrid}>
              <DailyBarChart title="Clicks (all)" data={toDailyPoints(data.series.clicks)} color="#0d9488" unit="number" market={region} />
              {/* Cassia 2026-06-14: Meta retorna CTR já em % (ex 2.30 = 2.30%); fmtPercent multiplica por 100 — então dividimos por 100 antes. */}
              <DailyBarChart title="CTR (all)" data={toDailyPoints(data.series.ctr, { divideBy: 100, roundTo: 4 })} color="#0891b2" unit="percent" market={region} />
            </section>

            <DailyBarChart title="CPC (all)" data={toDailyPoints(data.series.cpc, { roundTo: 2 })} color="#c2410c" unit="currency" market={region} />

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarRanking
                title={`Top Ads (by purchases — ${period.toUpperCase()})`}
                data={data.topAds7d.map((a: any) => ({ name: a.name, value: a.purchases }))}
                formatValue={(v) => formatNumber(v)}
              />
              <div>
                <DuplicatePurchasesDisclaimer compact />
                <MonthlyRoas data={data.series.roasMonthly} />
              </div>
            </section>

            <AdsTable data={data.ads} currency={currency} />

            <footer className="text-xs text-ink-500 text-center py-6 border-t border-ink-200 mt-8">
              <div>Larroudé Analytics · {region} · Meta Ads ({region === 'US' ? 'Larroudé US + PRE-ORDER US + Larroude New' : 'Larroudé Brasil + Larroude BR - Pre-Order'})</div>
              <div className="mt-1">Period: {data.dateRange.since} → {data.dateRange.until} · vs. {data.comparisonRange.since} → {data.comparisonRange.until}</div>
            </footer>
            </>)}
          </>
        )}
      </div>
    </div>
  );
}

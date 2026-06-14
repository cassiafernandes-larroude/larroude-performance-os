'use client';
// Cassia 2026-06-14: clone 1:1 do larroude-dash-meta — internalizado no lpos.
// Source: https://github.com/cassiafernandes-larroude/larroude-dash-meta
import { useCallback, useEffect, useState } from 'react';
import Header from './Header';
import KpiCard from './KpiCard';
import Funnel from './Funnel';
import GenderDonut from './GenderDonut';
import TimeSeriesArea from './charts/TimeSeriesArea';
import SpendVsRevenue from './charts/SpendVsRevenue';
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
            <div className="flex items-center gap-2 mt-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-stone-200 text-ink-600">{region}</span>
              <h2 className="text-sm font-semibold tracking-widest uppercase text-ink-700">
                {region === 'US' ? 'United States' : 'Brazil'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-brand-100 text-brand-700">
                {currency}
              </span>
            </div>

            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-9 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-semibold tracking-widest text-ink-400 uppercase">
                  <div>Cost &amp; Revenue</div>
                  <div>Revenue Efficiency</div>
                  <div>Click Metrics</div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard kpi={data.kpis.spend} currency={currency} />
                  <KpiCard kpi={data.kpis.revenue} currency={currency} />
                  <KpiCard kpi={data.kpis.roas} hint="Revenue / Spend" />
                  <KpiCard kpi={data.kpis.convRate} hint="Purchases / Clicks" />
                  <KpiCard kpi={data.kpis.clicks} />
                  <KpiCard kpi={data.kpis.cpc} currency={currency} hint="Spend / Clicks" />
                </div>
              </div>
              <div className="lg:col-span-3">
                <GenderDonut data={data.purchasesByGender} />
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-9">
                <CampaignsTable data={data.campaigns} currency={currency} />
              </div>
              <div className="lg:col-span-3">
                <Funnel {...data.funnel} />
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarRanking
                title="Top Campaigns"
                data={data.topCampaigns7d.map((c: any) => ({ name: c.name, value: c.spend }))}
                formatValue={(v) => formatCurrency(v, currency, true)}
              />
              <BarRanking
                title="Campaigns with high CPC"
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
            <SpendVsRevenue data={data.series.spendVsRevenue} currency={currency} />

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1"><ObjectiveSpend data={data.topCampaignsByObjective} currency={currency} /></div>
              <div className="lg:col-span-2"><TimeSeriesArea
                title="Amount spent"
                data={data.series.spendByDay}
                yFormat={(v) => formatCurrency(v, currency, true)}
              /></div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TimeSeriesArea title="Impressions" data={data.series.impressions} yFormat={(v) => formatNumber(v, true)} />
              <ReachFrequency data={data.series.reachFrequency} />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TimeSeriesArea title="Clicks (all)" data={data.series.clicks} yFormat={(v) => formatNumber(v, true)} />
              <TimeSeriesArea title="CTR (all)" data={data.series.ctr} yFormat={(v) => formatPercent(v, 2)} />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TimeSeriesArea title="CPC (all)" data={data.series.cpc} yFormat={(v) => formatCurrency(v, currency, true)} />
              <TimeSeriesArea title="ROAS · Daily" data={data.series.roas} yFormat={(v) => v.toFixed(2)} type="line" />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarRanking
                title="Top Ads (by purchases)"
                data={data.topAds7d.map((a: any) => ({ name: a.name, value: a.purchases }))}
                formatValue={(v) => formatNumber(v)}
              />
              <MonthlyRoas data={data.series.roasMonthly} />
            </section>

            <AdsTable data={data.ads} currency={currency} />

            <footer className="text-xs text-ink-500 text-center py-6 border-t border-ink-200 mt-8">
              <div>Larroudé Analytics · {region} · Meta Ads ({region === 'US' ? 'Larroudé US + PRE-ORDER US + Larroude New' : 'Larroudé Brasil + Larroude BR - Pre-Order'})</div>
              <div className="mt-1">Period: {data.dateRange.since} → {data.dateRange.until} · vs. {data.comparisonRange.since} → {data.comparisonRange.until}</div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

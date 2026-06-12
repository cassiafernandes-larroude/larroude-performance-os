'use client';
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, fmtUsd, fmtPct } from './ui';
import DailyBarChart from './DailyBarChart';
import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

export default function TabRevenue({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null); setErr('');
    api('revenue', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading revenue...</div>;

  const t = data.totals;
  const points = (data.points || []) as any[];
  const shopifyPoints = points.map(p => ({ date: p.date, value: p.shopify, inPeriod: true }));
  const lastClickPoints = points.map(p => ({ date: p.date, value: p.lastClick, inPeriod: true }));
  const campaignPoints = points.map(p => ({ date: p.date, value: p.klaviyoCampaign, inPeriod: true }));
  const flowPoints = points.map(p => ({ date: p.date, value: p.klaviyoFlow, inPeriod: true }));
  const pctPoints = points.map(p => ({ date: p.date, value: p.pctAttributed, inPeriod: true }));

  const stacked = 'space-y-4 mt-4';

  return (
    <>
      <SectionHead pill="Revenue" pillVariant="pink" title={<><b>Shopify Last-Click attribution</b> &middot; orders where Shopify's last-touch source = Klaviyo</>} />
      <div className="kpi-grid kpi-grid-4">
        <Kpi color="blue" label="Shopify Total" value={fmtUsd(t.shopify)} sub="placed orders" />
        <Kpi color="pink" label="Shopify Last-Click = Klaviyo" value={fmtUsd(t.lastClick)} sub="last-touch attribution" />
        <Kpi color="purple" label="Klaviyo (reported)" value={fmtUsd((t.klaviyoCampaign || 0) + (t.klaviyoFlow || 0))} sub="Camps + Flows reported by Klaviyo" />
        <Kpi color="teal" label="Email Participation" value={fmtPct(data.emailParticipationPct)} sub="Last-Click / Shopify Total" />
      </div>

      <SectionHead pill="Charts" pillVariant="blue" title={<><b>Daily series</b> &middot; {data.granularity || 'auto'} granularity</>} />
      <div className={stacked}>
        <DailyBarChart title="Shopify Total (placed orders)" data={shopifyPoints} color="#CBD5E1" unit="currency" market={market} />
        <DailyBarChart title="Shopify Revenue — Last-Click = Klaviyo" data={lastClickPoints} color="#E91E78" unit="currency" market={market} />
        <DailyBarChart title="Klaviyo Campaigns (reported)" data={campaignPoints} color="#ec4899" unit="currency" market={market} />
        <DailyBarChart title="Klaviyo Flows (reported via flow-series-reports)" data={flowPoints} color="#8b5cf6" unit="currency" market={market} />
        <DailyBarChart title="Email Participation % (Last-Click Klaviyo / Shopify Total)" data={pctPoints} color="#0d9488" unit="percent" market={market} />
      </div>
    </>
  );
}

'use client';
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, fmtUsd, fmtPct } from './ui';
import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

export default function TabInsights({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null); setErr('');
    api('insights', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading insights...</div>;

  return (
    <>
      <SectionHead pill="Insights" pillVariant="gold" title={<><b>Automated analysis</b> &middot; Green flags / Red flags / Next Steps</>} />
      <div className="insight-grid">
        <div className="insight-card green">
          <h3>Green Flags</h3>
          <ul>
            {data.greenFlags.length === 0 && <li className="empty">No positive signals in this period.</li>}
            {data.greenFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}
          </ul>
        </div>
        <div className="insight-card red">
          <h3>Red Flags</h3>
          <ul>
            {data.redFlags.length === 0 && <li className="empty">No critical alerts.</li>}
            {data.redFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}
          </ul>
        </div>
        <div className="insight-card blue">
          <h3>Next Steps</h3>
          <ul>
            {data.nextSteps.length === 0 && <li className="empty">All set.</li>}
            {data.nextSteps.map((f: string, i: number) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      </div>

      <SectionHead pill="Deliverability" pillVariant="teal" title={<><b>Health summary</b> &middot; sends</>} />
      <div className="kpi-grid kpi-grid-4">
        <Kpi color={data.deliverability.bouncesIssues > 0 ? 'red' : 'green'} label="Bounce > 0.5%" value={data.deliverability.bouncesIssues} sub={`of ${data.deliverability.totalCamps} campaigns`} />
        <Kpi color={data.deliverability.unsubsIssues > 0 ? 'red' : 'green'} label="Unsub > 0.5%" value={data.deliverability.unsubsIssues} sub={`of ${data.deliverability.totalCamps} campaigns`} />
        <Kpi label="Camps in period" value={data.deliverability.totalCamps} />
        <Kpi label="Live flows" value={data.deliverability.totalFlows} />
      </div>

      <SectionHead pill="Revenue Opps" pillVariant="pink" title={<><b>Revenue opportunities</b></>} />
      <div className="kpi-grid kpi-grid-3">
        <Kpi color="pink" label="Campaign Revenue" value={fmtUsd(data.revenueOpps.campaigns)} />
        <Kpi color="purple" label="Flow Revenue" value={fmtUsd(data.revenueOpps.flows)} />
        <Kpi color="teal" label="% Flows" value={fmtPct(data.revenueOpps.flowsShare)} sub="flow share of total email revenue" />
      </div>
    </>
  );
}

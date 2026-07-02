'use client';
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { Kpi, SectionHead, HBar, CompareCard, fmtMoney, fmtInt, fmtPct, fmtMoneyCents, fmtMoneyCompact, fmtRpr } from './ui';
import DailyBarChart from './DailyBarChart';
import RevenueVolumeChart from './RevenueVolumeChart';
import DeliverabilityCard from './DeliverabilityCard';
import type { Market, Period, CustomRange } from '@/types/klaviyo/models';
import GenericDiagnosticsPanel from '@/components/shared/GenericDiagnosticsPanel';
import { computeGenericDiagnostics } from '@/lib/data/generic-diagnostics';

const PINK = '#E91E78';
const NAVY = '#1e3a8a';
const TEAL = '#0d9488';
const BLUE = '#3b82f6';
const GOLD = '#B8861F';
const PURPLE = '#5B3FA0';
const GRAY = '#CBD5E1';
const ORANGE = '#E8722A';

export default function TabOverview({ market, period, custom }: { market: Market; period: Period; custom?: CustomRange }) {
  const [data, setData] = useState<any>(null);
  const [timing, setTiming] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [shopifyAttr, setShopifyAttr] = useState<any>(null);
  const [listHealth, setListHealth] = useState<any>(null);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    setData(null); setTiming(null); setInsights(null); setShopifyAttr(null); setListHealth(null); setErr('');
    // Carregam em paralelo — overview principal aparece rapido, outros chegam depois
    api('overview', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
    api('timing', market, period, custom).then(setTiming).catch(() => {});
    api('insights', market, period, custom).then(setInsights).catch(() => {});
    api('shopify-attribution', market, period, custom).then(setShopifyAttr).catch(() => {});
    api('list-health', market, period, custom).then(setListHealth).catch(() => {});
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">{err.slice(0, 200)}</div>;
  if (!data) return <div className="loading">Loading overview ({market} / {period})...</div>;

  const c = data.campaigns, f = data.flows;
  const cmp = (data.compareSeries || []) as any[];

  const revPts = cmp.map(p => ({ date: p.date, value: (p.campRevenue || 0) + (p.flowRevenue || 0), inPeriod: true }));
  const sendPts = cmp.map(p => ({ date: p.date, value: (p.campRecipients || 0) + (p.flowRecipients || 0), inPeriod: true }));
  const convPts = cmp.map(p => ({ date: p.date, value: (p.campConversions || 0) + (p.flowConversions || 0), inPeriod: true }));

  const campOrPts = cmp.map(p => ({ date: p.date, value: p.campOpenRate || 0, inPeriod: true }));
  const campCtrPts = cmp.map(p => ({ date: p.date, value: p.campClickRate || 0, inPeriod: true }));
  const campRprPts = cmp.map(p => ({ date: p.date, value: p.campRpr || 0, inPeriod: true }));
  const flowOrPts = cmp.map(p => ({ date: p.date, value: p.flowOpenRate || 0, inPeriod: true }));
  const flowCtrPts = cmp.map(p => ({ date: p.date, value: p.flowClickRate || 0, inPeriod: true }));
  const flowRprPts = cmp.map(p => ({ date: p.date, value: p.flowRpr || 0, inPeriod: true }));

  const shopifyPts = cmp.map(p => ({ date: p.date, value: p.shopifyTotal || 0, inPeriod: true }));
  // Shopify last-click vem de endpoint separado (mais rapido aparecer overview principal primeiro)
  const lastClickByDate = new Map<string, number>();
  const sa = (shopifyAttr?.points || []) as any[];
  for (const p of sa) lastClickByDate.set(p.date, p.value);
  const lastClickRevPts = cmp.map(p => ({ date: p.date, value: lastClickByDate.get(p.date) || 0, inPeriod: true }));
  const participationPts = cmp.map(p => {
    const lc = lastClickByDate.get(p.date) || 0;
    return { date: p.date, value: p.shopifyTotal ? (lc / p.shopifyTotal) * 100 : 0, inPeriod: true };
  });

  const stacked = 'space-y-4 mt-4';

  // Day-of-Week (from /api/timing)
  const byDay = (timing?.byDay || []) as any[];
  const bestDay = byDay.length ? [...byDay].sort((a, b) => b.avgRpr - a.avgRpr)[0] : null;
  const maxDayRev = Math.max(...byDay.map(d => d.avgRevenue || 0), 1);
  const maxDayOR = Math.max(...byDay.map(d => d.avgOpenRate || 0), 1);
  const maxDayCTR = Math.max(...byDay.map(d => d.avgCtr || 0), 1);

  // Cassia 2026-06-13: Cause & Effect diagnostics referente ao período selecionado
  const diagnostics = computeGenericDiagnostics({
    domain: 'email',
    invName: 'send volume',
    outName: 'email revenue',
    efficiencyName: 'RPR',
    efficiencyUnit: '$',
    invSeries: sendPts.map(p => ({ date: p.date, value: p.value })),
    outSeries: revPts.map(p => ({ date: p.date, value: p.value })),
    totalInv: c.recipients + (f.recipients || 0),
    totalOut: data.totalEmailRevenue,
    efficiency: c.rpr,
    efficiencyHealthyAt: 0.5,
    efficiencyCriticalAt: 0.05,
    fmt: market === 'BR'
      ? (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`
      : (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`,
  });

  return (
    <>
      <SectionHead pill="Overview" pillVariant="blue" title={<><b>Consolidated performance</b> &middot; campaigns + flows &middot; {period} &middot; market {market} &middot; {data.granularity || 'daily'}</>} right={`Generated ${new Date(data.generatedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`} />
      {diagnostics.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <GenericDiagnosticsPanel diagnostics={diagnostics} title={`CAUSE & EFFECT · ${period}`} />
        </div>
      )}
      <div className="kpi-grid kpi-grid-8">
        <Kpi color="pink" label="Email Revenue" value={fmtMoney(data.totalEmailRevenue, market)} sub={<>Camps + Flows</>} />
        <Kpi color="teal" label="Campaigns" value={c.count} sub={<><b>{fmtMoney(c.revenue, market)}</b> revenue</>} />
        <Kpi color="purple" label="Flows" value={f.count} sub={<><b>{fmtMoney(f.revenue, market)}</b> revenue</>} />
        <Kpi color="gold" label="Recipients (Camp)" value={fmtInt(c.recipients)} />
        <Kpi label="Open Rate" value={fmtPct(c.openRate)} sub="campaign avg" />
        <Kpi label="Click Rate" value={fmtPct(c.clickRate, 2)} sub="campaign avg" />
        <Kpi label="RPR" value={fmtRpr(c.rpr, market)} sub="per recipient" />
        <Kpi label="Conversions" value={fmtInt(c.conversions)} sub="campaigns" />
      </div>

      <SectionHead pill="Daily KPIs" pillVariant="pink" title={<><b>Email performance by day</b> &middot; bars with labeled values</>} />
      <div className={stacked}>
        <RevenueVolumeChart title="Receita × Volume (eficiência)" data={cmp.map(p => ({ date: p.date, revenue: (p.campRevenue || 0) + (p.flowRevenue || 0), volume: (p.campRecipients || 0) + (p.flowRecipients || 0) }))} market={market} />
        <DailyBarChart title="Daily Email Revenue" data={revPts} color={PINK} unit="currency" market={market} />
        <DailyBarChart title="Daily Send Volume" data={sendPts} color={NAVY} unit="number" market={market} />
        <DailyBarChart title="Daily Conversions" data={convPts} color={PURPLE} unit="number" market={market} />
      </div>

      <SectionHead pill="Engagement — Campaigns" pillVariant="pink" title={<><b>Campaign Open Rate, Click Rate, RPR</b> &middot; daily</>} />
      <div className={stacked}>
        <DailyBarChart title="Campaign Open Rate %" data={campOrPts} color={TEAL} unit="percent" market={market} />
        <DailyBarChart title="Campaign Click Rate %" data={campCtrPts} color={BLUE} unit="percent" market={market} />
        <DailyBarChart title="Campaign RPR ($)" data={campRprPts} color={GOLD} unit="rpr" market={market} />
      </div>

      <SectionHead pill="Engagement — Flows" pillVariant="purple" title={<><b>Flow Open Rate, Click Rate, RPR</b> &middot; daily</>} />
      <div className={stacked}>
        <DailyBarChart title="Flow Open Rate %" data={flowOrPts} color={TEAL} unit="percent" market={market} />
        <DailyBarChart title="Flow Click Rate %" data={flowCtrPts} color={BLUE} unit="percent" market={market} />
        <DailyBarChart title="Flow RPR ($)" data={flowRprPts} color={GOLD} unit="rpr" market={market} />
      </div>

      <SectionHead pill="Revenue — Email vs Shopify" pillVariant="blue" title={<><b>Shopify Last-Click attribution</b> &middot; orders where Shopify's last-touch source = Klaviyo</>} right={shopifyAttr ? '' : 'Loading attribution...'} />
      {(() => {
        const shopifyTotal = cmp.reduce((s, p) => s + (p.shopifyTotal || 0), 0);
        const lastClickTotal = shopifyAttr?.total || 0;
        const klaviyoReported = (c.revenue || 0) + (f.revenue || 0);
        const participation = shopifyTotal ? (lastClickTotal / shopifyTotal) * 100 : 0;
        return (
          <div className="kpi-grid kpi-grid-4" style={{ marginBottom: 14 }}>
            <Kpi color="blue" label="Shopify Total" value={fmtMoney(shopifyTotal, market)} sub="placed orders" />
            <Kpi color="pink" label="Shopify Last-Click = Klaviyo" value={shopifyAttr ? fmtMoney(lastClickTotal, market) : '...'} sub="last-touch attribution" />
            <Kpi color="purple" label="Klaviyo (reported)" value={fmtMoney(klaviyoReported, market)} sub="Camps + Flows from Klaviyo" />
            <Kpi color="teal" label="Email Participation" value={shopifyAttr ? fmtPct(participation) : '...'} sub="Last-Click / Shopify Total" />
          </div>
        );
      })()}
      <div className={stacked}>
        <DailyBarChart title="Daily Shopify Revenue (placed orders)" data={shopifyPts} color={GRAY} unit="currency" market={market} />
        <DailyBarChart title="Shopify Revenue — Last-Click = Klaviyo" data={lastClickRevPts} color={PINK} unit="currency" market={market} />
        <DailyBarChart title="Klaviyo Campaigns (reported by Klaviyo)" data={cmp.map(p => ({ date: p.date, value: p.campRevenue || 0, inPeriod: true }))} color="#ec4899" unit="currency" market={market} />
        <DailyBarChart title="Klaviyo Flows (reported via flow-series-reports)" data={cmp.map(p => ({ date: p.date, value: p.flowRevenue || 0, inPeriod: true }))} color="#8b5cf6" unit="currency" market={market} />
        <DailyBarChart title="Email Participation % (Last-Click Klaviyo / Shopify Total)" data={participationPts} color={PINK} unit="percent" market={market} />
      </div>

      {/* TIMING — Day of Week (moved from removed Timing tab) */}
      <SectionHead pill="Timing" pillVariant="orange" title={<><b>Performance by day of week</b> &middot; derived from send dates</>} />
      {!timing && <div className="loading">Loading timing...</div>}
      {timing && byDay.length > 0 && <>
        <div className="kpi-grid kpi-grid-4">
          <Kpi color="orange" label="Best day (RPR)" value={bestDay?.dayName || '-'} sub={bestDay ? <>RPR <b>{fmtRpr(bestDay.avgRpr, market)}</b></> : ''} />
          <Kpi label="Total campaigns" value={byDay.reduce((s, d) => s + d.campaigns, 0)} />
          <Kpi label="Avg Revenue / day" value={fmtMoney(byDay.reduce((s, d) => s + d.avgRevenue, 0) / 7)} />
          <Kpi label="Avg OR / day" value={fmtPct(byDay.reduce((s, d) => s + d.avgOpenRate, 0) / 7)} />
        </div>
        <div className="list-card" style={{ marginTop: 14 }}>
          <table className="list-table">
            <thead><tr>
              <th>Day</th>
              <th className="num">Campaigns</th>
              <th className="num">Avg Revenue</th>
              <th className="bar">Revenue</th>
              <th className="num">Avg OR%</th>
              <th className="bar">OR</th>
              <th className="num">Avg CTR%</th>
              <th className="bar">CTR</th>
              <th className="num">Avg RPR</th>
            </tr></thead>
            <tbody>
              {byDay.map(d => (
                <tr key={d.dayIndex}>
                  <td className="product"><div className="name">{d.dayName}</div></td>
                  <td className="num">{d.campaigns}</td>
                  <td className="num">{fmtMoney(d.avgRevenue, market)}</td>
                  <td className="bar"><HBar value={d.avgRevenue} max={maxDayRev} color="orange" label={fmtMoney(d.avgRevenue, market)} /></td>
                  <td className="num">{fmtPct(d.avgOpenRate)}</td>
                  <td className="bar"><HBar value={d.avgOpenRate} max={maxDayOR} color="teal" label={fmtPct(d.avgOpenRate)} /></td>
                  <td className="num">{fmtPct(d.avgCtr, 2)}</td>
                  <td className="bar"><HBar value={d.avgCtr} max={maxDayCTR} color="pink" label={fmtPct(d.avgCtr, 2)} /></td>
                  <td className="num"><b>{fmtRpr(d.avgRpr, market)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {/* LIST HEALTH (moved from removed List Health tab) */}
      <SectionHead pill="List Health" pillVariant="green" title={<><b>List growth &amp; deliverability</b> &middot; Subscribed vs Unsubscribed vs Spam &middot; {listHealth?.interval || 'loading'} granularity</>} right={listHealth?.metricsUsed?.subscribed || ''} />
      {/* Cassia 2026-07-02: card de deliverability — trend subs/unsubs/spam + alerta spam rate > 0.1% dos envios */}
      <DeliverabilityCard market={market} period={period} custom={custom} delivered={(c.recipients || 0) + (f.recipients || 0)} />
      {!listHealth && <div className="loading">Loading list health...</div>}
      {listHealth && (() => {
        const lhPoints = (listHealth.points || []) as any[];
        const subs = lhPoints.map(p => ({ date: p.date, value: p.subscriptions, inPeriod: true }));
        const unsubs = lhPoints.map(p => ({ date: p.date, value: p.unsubscribes, inPeriod: true }));
        const spam = lhPoints.map(p => ({ date: p.date, value: p.spam || 0, inPeriod: true }));
        const bounces = lhPoints.map(p => ({ date: p.date, value: p.bounces || 0, inPeriod: true }));
        return (
          <>
            <div className="kpi-grid kpi-grid-4">
              <Kpi color="green" label="Subscriptions" value={fmtInt(listHealth.total.subscriptions)} sub="period total" />
              <Kpi color="red" label="Unsubscribes" value={fmtInt(listHealth.total.unsubscribes)} sub="period total" />
              <Kpi color={listHealth.net >= 0 ? 'teal' : 'red'} label="Net Growth" value={(listHealth.net >= 0 ? '+' : '') + fmtInt(listHealth.net)} sub="subs - unsubs" />
              <Kpi label={listHealth.interval === 'day' ? 'Days' : listHealth.interval === 'week' ? 'Weeks' : 'Months'} value={lhPoints.length} sub={`${listHealth.interval || 'auto'} granularity`} />
            </div>
            <div className={stacked}>
              <DailyBarChart title="Subscriptions" data={subs} color="#267838" unit="number" market={market} />
              <DailyBarChart title="Unsubscribes" data={unsubs} color="#ef4444" unit="number" market={market} />
              <DailyBarChart title="Bounces" data={bounces} color="#f59e0b" unit="number" market={market} />
              <DailyBarChart title="Spam Complaints" data={spam} color="#B82F2F" unit="number" market={market} />
            </div>
          </>
        );
      })()}

      {/* INSIGHTS (moved from removed Insights tab) */}
      <SectionHead pill="Insights" pillVariant="gold" title={<><b>Automated analysis</b> &middot; Green flags / Red flags / Next Steps</>} />
      {!insights && <div className="loading">Loading insights...</div>}
      {insights && <>
        <div className="insight-grid">
          <div className="insight-card green">
            <h3>Green Flags</h3>
            <ul>
              {insights.greenFlags.length === 0 && <li className="empty">No positive signals in this period.</li>}
              {insights.greenFlags.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div className="insight-card red">
            <h3>Red Flags</h3>
            <ul>
              {insights.redFlags.length === 0 && <li className="empty">No critical alerts.</li>}
              {insights.redFlags.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div className="insight-card blue">
            <h3>Next Steps</h3>
            <ul>
              {insights.nextSteps.length === 0 && <li className="empty">All set.</li>}
              {insights.nextSteps.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
        <SectionHead pill="Deliverability" pillVariant="teal" title={<><b>Health summary</b> &middot; sends</>} />
        <div className="kpi-grid kpi-grid-4">
          <Kpi color={insights.deliverability.bouncesIssues > 0 ? 'red' : 'green'} label="Bounce > 0.5%" value={insights.deliverability.bouncesIssues} sub={`of ${insights.deliverability.totalCamps} campaigns`} />
          <Kpi color={insights.deliverability.unsubsIssues > 0 ? 'red' : 'green'} label="Unsub > 0.5%" value={insights.deliverability.unsubsIssues} sub={`of ${insights.deliverability.totalCamps} campaigns`} />
          <Kpi label="Camps in period" value={insights.deliverability.totalCamps} />
          <Kpi label="Live flows" value={insights.deliverability.totalFlows} />
        </div>
      </>}

      {/* Cassia 2026-06-14: Camps vs Flows expandido — adicionado CTOR, Conv Rate, Revenue, Sales, AOV */}
      <SectionHead pill="Camps vs Flows" pillVariant="teal" title={<><b>Period averages</b> &middot; full comparison</>} />
      {(() => {
        const cCtor = c.openRate > 0 ? (c.clickRate / c.openRate) * 100 : 0;
        const fCtor = f.openRate > 0 ? (f.clickRate / f.openRate) * 100 : 0;
        const cConvRate = c.recipients > 0 ? (c.conversions / c.recipients) * 100 : 0;
        const fConvRate = (f.recipients || 0) > 0 ? (f.conversions / f.recipients) * 100 : 0;
        const cAov = c.conversions > 0 ? c.revenue / c.conversions : 0;
        const fAov = f.conversions > 0 ? f.revenue / f.conversions : 0;
        const totalRev = (c.revenue || 0) + (f.revenue || 0);
        const totalConv = (c.conversions || 0) + (f.conversions || 0);
        const totalAov = totalConv > 0 ? totalRev / totalConv : 0;
        const campRevPct = totalRev > 0 ? (c.revenue / totalRev) * 100 : 0;
        const flowRevPct = totalRev > 0 ? (f.revenue / totalRev) * 100 : 0;
        const flowsEfficiency = c.rpr > 0 && f.rpr > 0 ? f.rpr / c.rpr : 0;

        return (
          <div className="kpi-compare-grid">
            <CompareCard label="Open Rate (OR)" camp={fmtPct(c.openRate)} flow={fmtPct(f.openRate)} note="bm: camp.>45% · flows>40%" warn={c.openRate < 45 || f.openRate < 40} />
            <CompareCard label="Click Rate (CTR)" camp={fmtPct(c.clickRate, 2)} flow={fmtPct(f.clickRate, 2)} note="bm: camp.>1,5% · flows>3%" warn={c.clickRate < 1.5 || f.clickRate < 3} />
            <CompareCard label="CTOR" camp={fmtPct(cCtor, 1)} flow={fmtPct(fCtor, 1)} note="click-to-open rate" />
            <CompareCard label="Conv. Rate" camp={fmtPct(cConvRate, 2)} flow={fmtPct(fConvRate, 2)} note="bm: >0,2%" warn={cConvRate < 0.2 || fConvRate < 0.2} />
            <CompareCard label={market === 'BR' ? 'R$/envio (RPR)' : '$/send (RPR)'} camp={fmtRpr(c.rpr, market)} flow={fmtRpr(f.rpr, market)} note={flowsEfficiency > 0 ? `flows ${flowsEfficiency.toFixed(1)}x more efficient` : 'per recipient'} />
            <CompareCard label="Revenue" camp={fmtMoneyCompact(c.revenue, market)} flow={fmtMoneyCompact(f.revenue, market)} note={totalRev > 0 ? `total ${fmtMoneyCompact(totalRev, market)} · camp ${campRevPct.toFixed(0)}% · flows ${flowRevPct.toFixed(0)}%` : 'total revenue'} />
            <CompareCard label="Sales (conversions)" camp={fmtInt(c.conversions)} flow={fmtInt(f.conversions)} note={`total: ${fmtInt(totalConv)} orders`} />
            <CompareCard label="Avg AOV" camp={fmtMoney(cAov, market)} flow={fmtMoney(fAov, market)} note={totalAov > 0 ? `combined: ${fmtMoney(totalAov, market)}` : 'avg order value'} />
          </div>
        );
      })()}
    </>
  );
}

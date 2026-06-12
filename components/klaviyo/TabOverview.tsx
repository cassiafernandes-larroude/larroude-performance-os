'use client';

import { useEffect, useState } from 'react';
import type { Market, Period } from '@/lib/klaviyo/types';
import { buildKlaviyoUrl, fmtMoney, fmtPct, fmtNumber } from './fetcher';
import DailyBarChart from './DailyBarChart';

interface Props {
  market: Market;
  period: Period;
  customRange?: { from: string; to: string };
}

export default function TabOverview({ market, period, customRange }: Props) {
  const [data, setData] = useState<any>(null);
  const [shopifyAttr, setShopifyAttr] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const overview = fetch(buildKlaviyoUrl('overview', market, period, customRange))
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`overview HTTP ${r.status}`)));
    const attr = fetch(buildKlaviyoUrl('shopify-attribution', market, period, customRange))
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null);
    const ins = fetch(buildKlaviyoUrl('insights', market, period, customRange))
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null);
    Promise.all([overview, attr, ins]).then(([o, a, i]) => {
      if (cancelled) return;
      setData(o);
      setShopifyAttr(a);
      setInsights(i);
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) { setError(err.message); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [market, period, customRange?.from, customRange?.to]);

  if (loading) return <div className="card p-8 text-center text-sm" style={{ color: '#6b7280' }}>Loading Klaviyo {market}…</div>;
  if (error) return <div className="card p-4" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}><strong>Error:</strong> {error}</div>;
  if (!data) return null;

  const k = data.kpis;
  const lh = data.listHealth;
  const daily = data.daily || {};
  const dow = data.dayOfWeek || [];
  const flags = insights?.flags || [];

  return (
    <div className="space-y-5">
      {/* KPIs gerais */}
      <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <Kpi label="TOTAL REVENUE" value={fmtMoney(k.totalRevenue, market, true)} hint="campaigns + flows" />
        <Kpi label="CAMPAIGNS REV" value={fmtMoney(k.campaignsRevenue, market, true)} hint={`${k.campaignsCount} sent`} />
        <Kpi label="FLOWS REV" value={fmtMoney(k.flowsRevenue, market, true)} hint={`${k.flowsCount} live`} />
        <Kpi label="OPEN RATE" value={fmtPct(k.openRate, 1)} hint={`${fmtNumber(k.totalOpens, market)} opens`} />
        <Kpi label="CLICK RATE" value={fmtPct(k.clickRate, 2)} hint={`${fmtNumber(k.totalClicks, market)} clicks`} />
        <Kpi label="UNSUB RATE" value={fmtPct(k.unsubRate, 3)} hint={`${fmtNumber(k.totalUnsubs, market)} unsubs`} />
        <Kpi label="REV / RECIP." value={fmtMoney(k.revenuePerRecipient, market)} hint={`${fmtNumber(k.totalRecipients, market)} recipients`} />
        <Kpi label="ORDERS" value={fmtNumber(k.totalOrders, market)} hint="attributed" />
      </div>

      {/* 11 Daily Charts */}
      <div className="section-marker">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
          DAILY EVOLUTION ({data.period.start} → {data.period.end})
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <DailyBarChart title="Total Revenue / day" data={daily.revenue || []} color="#10b981" unit="currency" market={market} height={180} />
        <DailyBarChart title="Recipients / day" data={daily.recipients || []} color="#5d4ec5" unit="number" market={market} height={180} />
        <DailyBarChart title="Opens / day" data={daily.opens || []} color="#0ea5e9" unit="number" market={market} height={180} />
        <DailyBarChart title="Clicks / day" data={daily.clicks || []} color="#d97757" unit="number" market={market} height={180} />
        <DailyBarChart title="Unsubscribes / day" data={daily.unsubscribes || []} color="#dc2626" unit="number" market={market} height={180} />
        <DailyBarChart title="Bounces / day" data={daily.bounced || []} color="#a16207" unit="number" market={market} height={180} />
        <DailyBarChart title="Campaigns Revenue / day" data={data.dailyCampaigns?.revenue || []} color="#ec4899" unit="currency" market={market} height={180} />
        <DailyBarChart title="Flows Revenue / day" data={data.dailyFlows?.revenue || []} color="#2c7a5b" unit="currency" market={market} height={180} />
        <DailyBarChart title="Campaigns Sends / day" data={data.dailyCampaigns?.recipients || []} color="#f59e0b" unit="number" market={market} height={180} />
        <DailyBarChart title="Flows Sends / day" data={data.dailyFlows?.recipients || []} color="#06b6d4" unit="number" market={market} height={180} />
        <DailyBarChart title="Campaigns Unsubs / day" data={data.dailyCampaigns?.unsubscribes || []} color="#be123c" unit="number" market={market} height={180} />
      </div>

      {/* List Health */}
      <section className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
          List Health (period)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label="Subscriptions" value={fmtNumber(lh.subs, market)} tone="good" />
          <Mini label="Unsubscribes" value={fmtNumber(lh.unsubs, market)} tone="warn" />
          <Mini label="Bounces" value={fmtNumber(lh.bounces, market)} tone="warn" />
          <Mini label="Spam complaints" value={fmtNumber(lh.spam, market)} tone="bad" />
        </div>
      </section>

      {/* Day-of-Week */}
      {dow.length > 0 && (
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
            Day-of-Week Performance
          </div>
          <div className="grid grid-cols-7 gap-2">
            {dow.map((d: any) => {
              const max = Math.max(...dow.map((x: any) => x.revenue), 1);
              return (
                <div key={d.dow} className="text-center">
                  <div className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#6b7280' }}>{d.label}</div>
                  <div className="h-24 flex items-end justify-center" style={{ background: '#faf8f3', borderRadius: 6 }}>
                    <div style={{ width: '60%', height: `${(d.revenue / max) * 100}%`, background: '#ec4899', borderRadius: '4px 4px 0 0' }} />
                  </div>
                  <div className="text-[10px] mt-1 font-num">{fmtMoney(d.revenue, market, true)}</div>
                  <div className="text-[9px]" style={{ color: '#9ca3af' }}>{fmtNumber(d.sends, market)} sends</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Insights (Green/Red/Next) */}
      {flags.length > 0 && (
        <section>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-muted)' }}>
            Insights ({flags.length})
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {flags.map((f: any, i: number) => {
              const colors = {
                green: { bg: '#ecf6f0', border: '#2c7a5b', text: '#1d5b41', icon: '✓' },
                red:   { bg: '#fff5f5', border: '#b3382f', text: '#7a221c', icon: '!' },
                next:  { bg: '#fff7e0', border: '#c0822a', text: '#8a5b18', icon: '→' },
              }[f.kind as 'green' | 'red' | 'next'];
              return (
                <div key={i} className="p-4 rounded-xl" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center gap-2" style={{ color: colors.text }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 999, background: colors.border, color: '#fff', fontSize: 10, fontWeight: 700,
                    }}>{colors.icon}</span>
                    {f.title}
                  </div>
                  <div className="text-[12px] leading-relaxed" style={{ color: colors.text }}>{f.body}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Shopify Last-Click attribution */}
      {shopifyAttr && (
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
            Shopify Last-Click Attribution (Klaviyo)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Mini label="Klaviyo orders" value={fmtNumber(shopifyAttr.ordersCount, market)} tone="good" />
            <Mini label="Klaviyo revenue" value={fmtMoney(shopifyAttr.revenue, market, true)} tone="good" />
            <Mini label="Share of total" value={fmtPct(shopifyAttr.matchedShare, 1)} tone="warn" />
            <Mini label="Total period revenue" value={fmtMoney(shopifyAttr.totalRevenueInPeriod, market, true)} tone="warn" />
          </div>
          {shopifyAttr.byCampaign?.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase mb-2" style={{ color: '#9ca3af' }}>Top campaigns by Shopify attribution</div>
              <div className="space-y-1">
                {shopifyAttr.byCampaign.slice(0, 10).map((c: any) => (
                  <div key={c.campaign} className="flex items-center gap-2 text-[11px]">
                    <span className="flex-1 truncate" style={{ color: '#374151' }} title={c.campaign}>{c.campaign}</span>
                    <span className="text-right w-16">{fmtNumber(c.orders, market)} ord.</span>
                    <span className="text-right w-20 font-semibold font-num">{fmtMoney(c.revenue, market, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Top Campaigns + Top Flows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
            Top 10 Campaigns by Revenue
          </div>
          <RowList items={data.topCampaigns} market={market} />
        </section>
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
            Top 10 Flows by Revenue
          </div>
          <RowList items={data.topFlows} market={market} />
        </section>
      </div>

      <div className="text-[11px] italic px-2" style={{ color: '#9ca3af' }}>
        {data.period.start} → {data.period.end} · cached 6h · fetched {data.durationMs}ms
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-2.5 flex flex-col">
      <div className="text-[8.5px] font-bold tracking-wider text-steel uppercase leading-tight">{label}</div>
      <div className="text-xl font-bold text-ink leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[9px] text-steel mt-0.5 leading-tight">{hint}</div>}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' }) {
  const colors = {
    good: { bg: '#ecf6f0', border: '#2c7a5b', text: '#1d5b41' },
    warn: { bg: '#fff7e0', border: '#c0822a', text: '#8a5b18' },
    bad:  { bg: '#fff5f5', border: '#b3382f', text: '#7a221c' },
  }[tone];
  return (
    <div className="rounded-xl p-3" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.text }}>{label}</div>
      <div className="font-bold mt-1" style={{ color: colors.text, fontSize: 'clamp(18px, 1.8vw, 22px)' }}>{value}</div>
    </div>
  );
}

function RowList({ items, market }: { items: any[]; market: Market }) {
  if (!items?.length) return <div className="text-[12px]" style={{ color: '#9ca3af' }}>No data.</div>;
  const max = Math.max(...items.map((i) => i.revenue), 1);
  return (
    <div className="space-y-1.5">
      {items.map((row, i) => (
        <div key={row.id} className="flex items-center gap-2">
          <span className="text-[10px] font-bold w-5" style={{ color: '#9ca3af' }}>#{i + 1}</span>
          <div className="flex-1 text-[12px] truncate" style={{ color: '#374151' }} title={row.name}>{row.name}</div>
          <div className="h-3 rounded" style={{ width: 40, background: '#fef2f8' }}>
            <div className="h-full rounded" style={{ width: `${(row.revenue / max) * 100}%`, background: '#ec4899' }} />
          </div>
          <div className="text-[11px] font-num font-semibold w-20 text-right">{fmtMoney(row.revenue, market, true)}</div>
        </div>
      ))}
    </div>
  );
}

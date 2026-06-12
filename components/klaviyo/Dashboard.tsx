'use client';

/**
 * Larroude CRM Klaviyo Dashboard — nativo no Performance OS.
 * Replica larroude-crm-dashboard.vercel.app com 5 tabs.
 *
 * Tabs: Overview · Campaigns · Flows · Segments · Benchmarks
 * Markets: US ($) · BR (R$)
 * Period: 7d/14d/28d/3M/6M/12M + custom
 *
 * Cassia 2026-06-12
 */

import { useEffect, useState } from 'react';
import type { Market, Period } from '@/lib/klaviyo/types';
import TabOverview from './TabOverview';
import TabCampaigns from './TabCampaigns';
import TabFlows from './TabFlows';
import TabSegments from './TabSegments';
import TabBenchmarks from './TabBenchmarks';
import PeriodFilter from './PeriodFilter';

type Tab = 'overview' | 'campaigns' | 'flows' | 'segments' | 'benchmarks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'flows', label: 'Flows' },
  { id: 'segments', label: 'Segments' },
  { id: 'benchmarks', label: 'Benchmarks' },
];

const PILL_BASE =
  'inline-flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-semibold transition-all duration-150 select-none';
const MARKET_ACTIVE = `${PILL_BASE} bg-[#ec4899] text-white px-3 sm:px-4 py-1.5`;
const MARKET_INACTIVE = `${PILL_BASE} bg-[#ebe9e3] text-[#1a1a1a] hover:bg-[#ddd9d0] px-3 sm:px-4 py-1.5`;
const TAB_ACTIVE = `${PILL_BASE} bg-[#1a1a1a] text-white px-3 sm:px-4 py-1.5`;
const TAB_INACTIVE = `${PILL_BASE} bg-transparent text-[#1a1a1a] hover:bg-[#ebe9e3] px-3 sm:px-4 py-1.5`;

export default function KlaviyoDashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('28d');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | undefined>();

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 lg:px-8 main-dashboard-root">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
            >
              Klaviyo CRM
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
              Email marketing — campaigns, flows, segments, benchmarks · US + BR
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['US', 'BR'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className={market === m ? MARKET_ACTIVE : MARKET_INACTIVE}
              >
                <span className="text-[10px] font-bold opacity-70 mr-1.5">{m}</span>
                {m === 'US' ? 'United States' : 'Brazil'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap border-b" style={{ borderColor: 'var(--border)' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={tab === t.id ? TAB_ACTIVE : TAB_INACTIVE}
              style={{ marginBottom: -1 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <PeriodFilter
        value={period}
        customRange={customRange}
        onChange={(p, custom) => {
          setPeriod(p);
          setCustomRange(custom);
        }}
      />

      <div className="mt-6">
        {tab === 'overview' && <TabOverview market={market} period={period} customRange={customRange} />}
        {tab === 'campaigns' && <TabCampaigns market={market} period={period} customRange={customRange} />}
        {tab === 'flows' && <TabFlows market={market} period={period} customRange={customRange} />}
        {tab === 'segments' && <TabSegments market={market} />}
        {tab === 'benchmarks' && <TabBenchmarks market={market} period={period} customRange={customRange} />}
      </div>
    </main>
  );
}

'use client';

/**
 * Larroude CRM Klaviyo Dashboard — replica 100% do original.
 * Cream theme #F4ECDF, 5 tabs, period filter.
 */

import { useState } from 'react';
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

export default function KlaviyoDashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('28d');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | undefined>();

  return (
    <div className="klaviyo-root">
      <main className="mx-auto max-w-[1480px] px-4 py-6 lg:px-8">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-[28px] lg:text-[40px] font-bold leading-tight">
                Klaviyo CRM
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--kv-ink-soft)' }}>
                Email marketing — campaigns, flows, segments, benchmarks · US + BR
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(['US', 'BR'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMarket(m)}
                  className={`kv-market-pill ${market === m ? 'active' : ''}`}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{m}</span>
                  {m === 'US' ? 'United States' : 'Brazil'}
                </button>
              ))}
            </div>
          </div>

          <div className="kv-tabs mt-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`kv-tab ${tab === t.id ? 'active' : ''}`}
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
          {tab === 'segments' && <TabSegments market={market} period={period} customRange={customRange} />}
          {tab === 'benchmarks' && <TabBenchmarks market={market} period={period} customRange={customRange} />}
        </div>
      </main>
    </div>
  );
}

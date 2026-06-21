'use client';
import React, { useState, useMemo } from 'react';
import TabOverview from './TabOverview';
import TabCampaigns from './TabCampaigns';
import TabFlows from './TabFlows';
import TabSegments from './TabSegments';
import TabBenchmarks from './TabBenchmarks';
import CampaignGenerator from './CampaignGenerator';
import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'flows',     label: 'Flows' },
  { id: 'segments',  label: 'Segments' },
  { id: 'benchmarks',label: 'Benchmarks' },
  { id: 'gerador',   label: 'Gerador de Campanha' }
] as const;
type TabId = typeof TABS[number]['id'];

const PRESETS: Period[] = ['L1D','L7D','L28D','3M','6M','12M'];

const PRESET_LABELS: Record<string, string> = {
  L1D: '1D', L7D: '7D', L28D: '28D', '3M': '3M', '6M': '6M', '12M': '12M'
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [period, setPeriod] = useState<Period>('L28D');
  const [tab, setTab] = useState<TabId>('overview');
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState<string>(isoDaysAgo(7));
  const [customEnd, setCustomEnd] = useState<string>(todayIso());
  const [appliedCustom, setAppliedCustom] = useState<CustomRange | undefined>(undefined);

  const today = new Date().toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  const effectiveCustom = period === 'CUSTOM' ? appliedCustom : undefined;
  const periodLabel = useMemo(() => {
    if (period === 'CUSTOM' && appliedCustom) return `${appliedCustom.start} → ${appliedCustom.end}`;
    return period;
  }, [period, appliedCustom]);

  function applyCustom() {
    if (customStart && customEnd && customStart <= customEnd) {
      setAppliedCustom({ start: customStart, end: customEnd });
      setPeriod('CUSTOM');
      setCustomOpen(false);
    }
  }
  function selectPreset(p: Period) {
    setPeriod(p);
    setAppliedCustom(undefined);
  }

  return (
    <div className="klaviyo-root">
      <div className="app">
      <header>
        <h1>Larroudé<span className="sep">-</span>CRM Klaviyo</h1>
        <div className="market-row">
          <button className={'market-pill' + (market === 'US' ? ' active' : '')} onClick={() => setMarket('US')}>
            <span className="flag">US</span>United States
          </button>
          <button className={'market-pill' + (market === 'BR' ? ' active' : '')} onClick={() => setMarket('BR')}>
            <span className="flag" style={{ background: market === 'BR' ? 'rgba(255,255,255,.3)' : 'var(--green)' }}>BR</span>Brazil
          </button>
        </div>
        <p className="subtitle">Klaviyo email marketing · <b>{today}</b> · period <b>{periodLabel}</b> · market <b>{market}</b></p>

        <div className="tab-nav">
          {TABS.map(t => (
            <button key={t.id} className={'tab-btn' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </header>

      {tab !== 'gerador' && (
      <div className="filter-card">
        <div className="filter-group">
          <span className="filter-label">Period</span>
          <div className="btn-row">
            {PRESETS.map(p => (
              <button key={p} className={'btn-pill' + (period === p ? ' active' : '')} onClick={() => selectPreset(p)}>
                {PRESET_LABELS[p] || p}
              </button>
            ))}
            <button className={'btn-pill' + (period === 'CUSTOM' ? ' active' : '')} onClick={() => setCustomOpen(o => !o)}>
              Custom
            </button>
          </div>
        </div>
        {customOpen && (
          <div className="filter-group" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="filter-label">From</span>
            <input type="date" className="search-input" value={customStart} max={customEnd} onChange={e => setCustomStart(e.target.value)} style={{ minWidth: 150 }} />
            <span className="filter-label">To</span>
            <input type="date" className="search-input" value={customEnd} min={customStart} max={todayIso()} onChange={e => setCustomEnd(e.target.value)} style={{ minWidth: 150 }} />
            <button className="btn-pill active" onClick={applyCustom} disabled={!customStart || !customEnd || customStart > customEnd}>Apply</button>
            <button className="btn-pill" onClick={() => setCustomOpen(false)}>Cancel</button>
          </div>
        )}
        <button className="btn-pill" onClick={() => location.reload()}>↻ Refresh</button>
      </div>
      )}

      {tab === 'overview' && <TabOverview market={market} period={period} custom={effectiveCustom} />}
      {tab === 'campaigns' && <TabCampaigns market={market} period={period} custom={effectiveCustom} />}
      {tab === 'flows' && <TabFlows market={market} period={period} custom={effectiveCustom} />}
      {tab === 'segments' && <TabSegments market={market} period={period} custom={effectiveCustom} />}
      {tab === 'benchmarks' && <TabBenchmarks market={market} period={period} custom={effectiveCustom} />}
      {tab === 'gerador' && <CampaignGenerator initialMarket={market} />}

      <div className="foot">
        Larroudé - CRM Klaviyo · {market} · {periodLabel} · generated {new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })} · 12h cache
      </div>
      </div>
    </div>
  );
}

'use client';
// Cassia 2026-07-02: List Health / Deliverability card — trend of subscribed vs unsubscribed
// vs spam complaints from /api/klaviyo/list-health (fetched via the shared fetcher, which
// carries the &v=KLAVIYO_CACHE_V edge-cache buster). Alert rule: spam complaint rate above
// 0.1% of delivered emails is the industry deliverability red line (Gmail/Yahoo bulk-sender
// requirement) — highlighted red.
import React, { useEffect, useState } from 'react';
import { api } from './fetcher';
import { Kpi, fmtInt } from './ui';
import MultiLineChart from './MultiLineChart';
import type { Market, Period, CustomRange } from '@/types/klaviyo/models';

const SPAM_RATE_THRESHOLD = 0.1; // % of delivered

export default function DeliverabilityCard({
  market, period, custom, delivered,
}: {
  market: Market;
  period: Period;
  custom?: CustomRange;
  /** Denominator for spam rate — total emails delivered/sent in the period (camp + flow recipients). */
  delivered?: number;
}) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null); setErr('');
    api('list-health', market, period, custom).then(setData).catch(e => setErr(String(e.message || e)));
  }, [market, period, custom?.start, custom?.end]);

  if (err) return <div className="empty">List health unavailable: {err.slice(0, 160)}</div>;
  if (!data) return <div className="loading">Loading deliverability...</div>;

  const points = (data.points || []) as any[];
  const dates = points.map(p => p.date);
  const totalSpam = data.total?.spam || 0;
  const spamRate = delivered && delivered > 0 ? (totalSpam / delivered) * 100 : null;
  const spamAlert = spamRate != null && spamRate > SPAM_RATE_THRESHOLD;

  return (
    <>
      <div className="kpi-grid kpi-grid-4">
        <Kpi color="green" label="Subscribed" value={fmtInt(data.total?.subscriptions || 0)} sub="period total" />
        <Kpi color="red" label="Unsubscribed" value={fmtInt(data.total?.unsubscribes || 0)} sub="period total" />
        <Kpi color={totalSpam > 0 ? 'orange' : 'green'} label="Spam Complaints" value={fmtInt(totalSpam)} sub="period total" />
        <Kpi
          color={spamAlert ? 'red' : 'green'}
          label="Spam Rate"
          value={spamRate == null ? '—' : `${spamRate.toFixed(3)}%`}
          sub={spamAlert
            ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>&#9888; above {SPAM_RATE_THRESHOLD}% threshold</span>
            : spamRate == null ? 'delivered volume unavailable' : `healthy (< ${SPAM_RATE_THRESHOLD}%)`}
        />
      </div>
      <div className="mt-4">
        <MultiLineChart
          title={`List Health / Deliverability — Subscribed vs Unsubscribed vs Spam (${data.interval || 'auto'})`}
          dates={dates}
          series={[
            { label: 'Subscribed', values: points.map(p => p.subscriptions || 0), color: '#267838' },
            { label: 'Unsubscribed', values: points.map(p => p.unsubscribes || 0), color: '#ef4444' },
            { label: 'Spam Complaints', values: points.map(p => p.spam || 0), color: '#B82F2F' },
          ]}
          unit="number"
          market={market}
        />
      </div>
      {spamAlert && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(184,47,47,0.08)', border: '1px solid rgba(184,47,47,0.35)', color: '#B82F2F', fontSize: 12 }}>
          <b>Deliverability alert:</b> spam complaint rate is {spamRate!.toFixed(3)}% of delivered emails — above the {SPAM_RATE_THRESHOLD}% red line.
          Review list hygiene, sending frequency and segment targeting before the next send.
        </div>
      )}
    </>
  );
}

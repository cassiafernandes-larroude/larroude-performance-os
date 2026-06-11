'use client';

import type { CategoryLtv, CustomerJourney, LtvKpiSummary, Market } from '@/lib/ltv-dashboard/queries';
import { formatMoney, formatPercent, formatNumber } from '@/lib/ltv-dashboard/format';

/**
 * Heuristics to generate automatic insights.
 * Not "machine learning" — it's interpretation of KPIs vs fashion DTC benchmarks.
 * `tempo1to2` comes from Journey (full history, same definition used in the "Time 1st → 2nd" block)
 * — guarantees the WHOLE dashboard uses the same methodology.
 */
function buildInsights(
  summary: LtvKpiSummary,
  categories: CategoryLtv[] | null,
  market: Market,
  tempo1to2: number,
) {
  const insights: Array<{ kind: 'good' | 'warn' | 'bad' | 'info'; title: string; body: string }> = [];

  // LTV / CAC ratio
  if (summary.ltvCacRatio > 0) {
    if (summary.ltvCacRatio >= 3) {
      insights.push({
        kind: 'good',
        title: `Healthy LTV / CAC (${summary.ltvCacRatio.toFixed(2)}x)`,
        body: `Each ${formatMoney(summary.cac, market, true)} invested returns ${formatMoney(
          summary.ltvPredictive,
          market,
          true
        )} over the customer's lifetime. Ratio ≥3x means room to scale acquisition.`,
      });
    } else if (summary.ltvCacRatio >= 2) {
      insights.push({
        kind: 'warn',
        title: `Tight LTV / CAC (${summary.ltvCacRatio.toFixed(2)}x)`,
        body: `Ratio between 2x and 3x signals thin margin. Consider optimizing creatives before scaling, or push CAC down.`,
      });
    } else {
      insights.push({
        kind: 'bad',
        title: `LTV / CAC below healthy (${summary.ltvCacRatio.toFixed(2)}x)`,
        body: `You're spending more to acquire than you recover. Reduce CAC (cut high-CPA campaigns) or raise LTV (upsell, win-back).`,
      });
    }
  } else {
    insights.push({
      kind: 'info',
      title: 'LTV / CAC unavailable',
      body: 'Meta+Google spend has not yet been synced for this period. KPI is out until the next refresh.',
    });
  }

  // Returning Customer Rate (vs fashion benchmark 25-35%)
  const rr = summary.returningCustomerRate;
  if (rr >= 35) {
    insights.push({
      kind: 'good',
      title: `High returning rate (${formatPercent(rr)})`,
      body: `Your base is loyal — above the fashion DTC benchmark (25-35%). Capture it: subscriptions, loyalty program, exclusive launches.`,
    });
  } else if (rr >= 25) {
    insights.push({
      kind: 'good',
      title: `Healthy returning rate (${formatPercent(rr)})`,
      body: `Within the fashion DTC benchmark (25-35%). Keep your email/CRM cadence to nurture retention.`,
    });
  } else if (rr >= 15) {
    insights.push({
      kind: 'warn',
      title: `Returning rate below benchmark (${formatPercent(rr)})`,
      body: `Caution: under 25% signals a retention problem. Review post-purchase experience, win-back emails, perceived quality.`,
    });
  } else {
    insights.push({
      kind: 'bad',
      title: `Low returning rate (${formatPercent(rr)})`,
      body: `Critical. Customers aren't coming back. Audit: post-purchase experience, product quality, brand perception.`,
    });
  }

  // Purchase Frequency
  if (summary.purchaseFrequency >= 1.5) {
    insights.push({
      kind: 'good',
      title: `Strong purchase frequency (${summary.purchaseFrequency.toFixed(2)})`,
      body: `Customers come back more than 1.5x on average — great for a fashion vertical. Consider segmenting high-frequency buyers for early access.`,
    });
  } else if (summary.purchaseFrequency < 1.15) {
    insights.push({
      kind: 'warn',
      title: `Low frequency (${summary.purchaseFrequency.toFixed(2)})`,
      body: `Most customers buy only once in the period. Focus on the 2nd purchase: 30/60/90-day email series, cross-sell offers.`,
    });
  }

  // Time 1st → 2nd purchase (lifetime — IDENTICAL to the Journey block)
  if (tempo1to2 > 0) {
    if (tempo1to2 <= 30) {
      insights.push({
        kind: 'good',
        title: `Short time 1st → 2nd purchase (${tempo1to2}d)`,
        body: `Customers make their 2nd purchase in under 30 days on median. Trigger cross-sell flows around D+${Math.max(7, Math.round(tempo1to2 * 0.6))} after the 1st purchase to capture this window.`,
      });
    } else if (tempo1to2 >= 60) {
      insights.push({
        kind: 'info',
        title: `Long time 1st → 2nd purchase (${tempo1to2}d)`,
        body: `Median between 1st and 2nd purchase above 60 days. Normal in premium fashion. Ensure nurture flow (email D+30, D+60) + win-back firing around D+${Math.round(tempo1to2 * 1.3)}.`,
      });
    } else {
      insights.push({
        kind: 'good',
        title: `Moderate time 1st → 2nd purchase (${tempo1to2}d)`,
        body: `Median between 1st and 2nd purchase of ${tempo1to2} days. Cross-sell flow should fire around D+${Math.round(tempo1to2 * 0.5)}-${Math.round(tempo1to2 * 0.7)} after the 1st purchase.`,
      });
    }
  }

  // Top category insight
  if (categories && categories.length > 0) {
    const topByLtv = [...categories]
      .filter((c) => c.customers >= 20)
      .sort((a, b) => b.customerLtvAvg - a.customerLtvAvg)[0];
    const topByVolume = [...categories].sort((a, b) => b.units - a.units)[0];

    if (topByVolume) {
      insights.push({
        kind: 'info',
        title: `Volume leading category: ${topByVolume.categoryName}`,
        body: `${formatNumber(topByVolume.units, market)} units sold, ${formatNumber(
          topByVolume.customers,
          market
        )} unique customers. ${
          topByLtv && topByLtv.categoryCode !== topByVolume.categoryCode
            ? `But the category bringing higher-LTV customers is "${topByLtv.categoryName}" (${formatMoney(
                topByLtv.customerLtvAvg,
                market,
                true
              )} avg). Consider investing more in ${topByLtv.categoryName} in the acquisition funnel.`
            : 'The same category leads volume AND LTV — concentrate marketing effort here.'
        }`,
      });
    }
  }

  // CAC recommendation
  if (summary.cac > 0 && summary.ltvPredictive > 0) {
    const sustainableCac = summary.ltvPredictive / 3;
    if (sustainableCac > summary.cac * 1.2) {
      insights.push({
        kind: 'good',
        title: `Room to raise CAC up to ${formatMoney(sustainableCac, market, true)}`,
        body: `Keeping LTV/CAC ratio ≥3x, you can raise the current CAC (${formatMoney(
          summary.cac,
          market,
          true
        )}) by up to ${(((sustainableCac - summary.cac) / summary.cac) * 100).toFixed(0)}% and still stay healthy. Consider raising bids on top-performing campaigns.`,
      });
    } else if (sustainableCac < summary.cac * 0.85) {
      insights.push({
        kind: 'warn',
        title: `CAC above sustainable (${formatMoney(sustainableCac, market, true)})`,
        body: `To keep LTV/CAC ≥3x, the ideal CAC would be ${formatMoney(
          sustainableCac,
          market,
          true
        )}. Current is ${(((summary.cac - sustainableCac) / sustainableCac) * 100).toFixed(0)}% above. Cut budget on high-CPA campaigns.`,
      });
    } else {
      insights.push({
        kind: 'info',
        title: `CAC stable near the healthy ceiling`,
        body: `Current ${formatMoney(summary.cac, market, true)} ≈ recommended ceiling ${formatMoney(
          sustainableCac,
          market,
          true
        )}. Don't scale aggressively without first improving conversion/retention.`,
      });
    }
  }

  return insights;
}

function colorFor(kind: 'good' | 'warn' | 'bad' | 'info'): { bg: string; border: string; ink: string; icon: string } {
  switch (kind) {
    case 'good':
      return { bg: '#ecf6f0', border: '#2c7a5b', ink: '#1d5b41', icon: '✓' };
    case 'warn':
      return { bg: '#fff7e0', border: '#c0822a', ink: '#8a5b18', icon: '!' };
    case 'bad':
      return { bg: '#fff5f5', border: '#b3382f', ink: '#7a221c', icon: '✗' };
    case 'info':
      return { bg: '#f5f3ee', border: '#8a8a8a', ink: '#4a4a4a', icon: 'i' };
  }
}

export default function AnalysisBlock({
  summary,
  categories,
  market,
  journey,
}: {
  summary: LtvKpiSummary | undefined;
  categories: CategoryLtv[] | null;
  market: Market;
  journey?: CustomerJourney | null;
}) {
  if (!summary) {
    return null;
  }
  // time 1→2 from Journey (lifetime, same methodology across the dashboard)
  const tempo1to2 = journey?.medianDays1to2 ?? 0;
  const insights = buildInsights(summary, categories, market, tempo1to2);
  if (insights.length === 0) return null;

  return (
    <div className="card-section">
      <div className="section-head">
        <span
          className="section-badge"
          style={{ background: '#1a1a1a', color: '#fff' }}
        >
          🧠 ANALYSIS
        </span>
        <h3>Analysis & Recommendations</h3>
        <span className="section-meta">
          Automatic insights based on fashion DTC benchmarks · {insights.length} points
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          alignItems: 'stretch',
        }}
      >
        {insights.map((ins, i) => {
          const c = colorFor(ins.kind);
          return (
            <div
              key={i}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                padding: '14px 16px',
                minHeight: 124,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: c.ink,
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: c.border,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {c.icon}
                </span>
                {ins.title}
              </div>
              <div style={{ fontSize: 12.5, color: c.ink, lineHeight: 1.5 }}>{ins.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import type { Market } from '@/lib/ltv-dashboard/queries';

export default function Header({
  market,
  onMarketChange,
  freshness,
  title = 'Larroudé · LTV Dashboard',
  subtitle,
}: {
  market: Market;
  onMarketChange: (m: Market) => void;
  freshness: string;
  title?: string;
  subtitle?: React.ReactNode;
}) {
  const fresh = freshness
    ? new Date(freshness + 'T12:00:00').toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <header className="header">
      <h1 className="title">{title}</h1>
      <div className="toggle">
        <button
          className={`toggle-btn ${market === 'US' ? 'active' : ''}`}
          data-market="US"
          onClick={() => onMarketChange('US')}
          aria-pressed={market === 'US'}
        >
          <span className="flag">US</span>
          United States
        </button>
        <button
          className={`toggle-btn ${market === 'BR' ? 'active' : ''}`}
          data-market="BR"
          onClick={() => onMarketChange('BR')}
          aria-pressed={market === 'BR'}
        >
          <span className="flag">BR</span>
          Brazil
        </button>
      </div>
      <div className="subtitle">
        {subtitle ?? (
          <>
            Customer Lifetime Value (LTV), AOV and Repeat Purchase Rate by store and product · data from <b>{fresh}</b> ·
            Shopify orders via BigQuery
          </>
        )}
      </div>
    </header>
  );
}

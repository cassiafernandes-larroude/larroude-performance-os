'use client';

import type { Market } from '@/lib/cac-dashboard/queries';

export default function Header({
  market,
  onMarketChange,
  freshness,
}: {
  market: Market;
  onMarketChange: (m: Market) => void;
  freshness: string;
}) {
  const fresh = freshness
    ? new Date(freshness + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <header className="header">
      <h1 className="title">Larroudé · CAC Dashboard</h1>
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
          Brasil
        </button>
      </div>
      <div className="subtitle">
        Custo de aquisição (CAC) por loja e por produto · dados de <b>{fresh}</b> · Meta Ads + Google Ads + Shopify, via BigQuery
      </div>
    </header>
  );
}

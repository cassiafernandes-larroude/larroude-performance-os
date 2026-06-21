'use client';
// Cassia 2026-06-14: Top N criativos por ROAS, com imagem do criativo Meta.

import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';
import type { AdRow } from '@/lib/meta-ads-native/types';

interface Props {
  ads: AdRow[];
  currency: string;
  top?: number;
  minSpend?: number;
}

const FALLBACK_IMG =
  'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 48 48\'><rect width=\'48\' height=\'48\' fill=\'%23eee\'/><text x=\'24\' y=\'28\' text-anchor=\'middle\' font-size=\'10\' fill=\'%23999\'>—</text></svg>';

export default function TopCreativesByRoas({ ads, currency, top = 10, minSpend = 1000 }: Props) {
  const rows = ads
    .filter(a => (a.spend || 0) >= minSpend && (a.roas || 0) > 0)
    .sort((a, b) => (b.roas || 0) - (a.roas || 0))
    .slice(0, top);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[18px]">🏆</span>
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Top {top} criativos por ROAS</h3>
          <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            Apenas criativos com spend ≥ {formatCurrency(minSpend, currency, true)} no período. Ordenados por ROAS desc.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] py-6 text-center" style={{ color: 'var(--ink-muted)' }}>
          Nenhum criativo com spend ≥ {formatCurrency(minSpend, currency, true)} no período.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-5 gap-3">
          {rows.map((ad, idx) => {
            const thumb = (ad as any).thumbnail || FALLBACK_IMG;
            const roas = ad.roas || 0;
            const roasColor = roas >= 3 ? '#10b981' : roas >= 1.5 ? '#3b82f6' : '#f59e0b';
            return (
              <div key={ad.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'white' }}>
                <div className="relative" style={{ aspectRatio: '1 / 1', background: '#eee' }}>
                  <img
                    src={thumb}
                    alt={ad.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }}
                  />
                  <div
                    className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: 'rgba(0,0,0,0.7)', color: 'white' }}
                  >
                    #{idx + 1}
                  </div>
                  <div
                    className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: roasColor, color: 'white' }}
                  >
                    {formatDecimal(roas)}×
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[10px] font-medium truncate mb-1" style={{ color: 'var(--ink)' }} title={ad.name} data-no-translate="true">
                    {ad.name}
                  </div>
                  <div className="text-[9px]" style={{ color: 'var(--ink-muted)' }}>{ad.account}</div>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-[9px]">
                    <div>
                      <div className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Spend</div>
                      <div className="font-num font-semibold" style={{ color: 'var(--ink)' }}>{formatCurrency(ad.spend, currency, true)}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Rev</div>
                      <div className="font-num font-semibold" style={{ color: '#10b981' }}>{formatCurrency(ad.revenue, currency, true)}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Purch</div>
                      <div className="font-num font-semibold" style={{ color: 'var(--ink)' }}>{formatNumber(ad.purchases)}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';
// Cassia 2026-06-14: Top N URLs (destino dos ads) por ROAS.

import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';

interface AdWithUrl {
  spend: number;
  revenue: number;
  purchases: number;
  linkUrl?: string | null;
}

interface Props {
  ads: AdWithUrl[];
  currency: string;
  top?: number;
  minSpend?: number;
}

/** Normaliza URL para path Shopify (descarta protocolo + domínio + query string). */
function canonicalize(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Mantém path; descarta domínio e query.
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    // Não é URL válida — usa raw
    return url.split('?')[0];
  }
}

export default function TopUrlsByRoas({ ads, currency, top = 5, minSpend = 500 }: Props) {
  const map = new Map<string, { spend: number; revenue: number; purchases: number; ads: number }>();
  for (const ad of ads) {
    const u = canonicalize(ad.linkUrl);
    if (!u) continue;
    const ex = map.get(u) ?? { spend: 0, revenue: 0, purchases: 0, ads: 0 };
    ex.spend += ad.spend || 0;
    ex.revenue += ad.revenue || 0;
    ex.purchases += ad.purchases || 0;
    ex.ads += 1;
    map.set(u, ex);
  }

  const rows = Array.from(map.entries())
    .filter(([, v]) => v.spend >= minSpend)
    .map(([url, v]) => ({
      url, ...v,
      roas: v.spend > 0 ? v.revenue / v.spend : 0,
    }))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, top);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[18px]">🔗</span>
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Top {top} URLs por ROAS</h3>
          <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            Destination URLs dos criativos com spend ≥ {formatCurrency(minSpend, currency, true)}.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] py-4 text-center" style={{ color: 'var(--ink-muted)' }}>
          Nenhum URL atende ao filtro de spend mínimo.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] sm:text-[12px] min-w-[640px]">
            <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
              <tr>
                <th className="text-left px-2 py-1.5 w-12">#</th>
                <th className="text-left px-2 py-1.5">URL</th>
                <th className="text-right px-2 py-1.5">ROAS</th>
                <th className="text-right px-2 py-1.5">SPEND</th>
                <th className="text-right px-2 py-1.5">PURCHASES</th>
                <th className="text-right px-2 py-1.5">REVENUE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.url} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: 'var(--ink-muted)' }}>#{i + 1}</td>
                  <td className="px-2 py-1.5 max-w-[420px] truncate">
                    <a
                      href={r.url.startsWith('http') ? r.url : `https://larroude.com${r.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: '#3b82f6' }}
                      title={r.url}
                      data-no-translate="true"
                    >
                      {r.url}
                    </a>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold" style={{ color: r.roas >= 2 ? '#10b981' : r.roas >= 1 ? '#f59e0b' : 'var(--ink-muted)' }}>
                    {formatDecimal(r.roas)}×
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.spend, currency, true)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.purchases)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.revenue, currency, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

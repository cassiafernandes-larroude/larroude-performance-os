'use client';
// Cassia 2026-06-14: aba Creatives × Shopify — extrai ref (SKU ou Collection ID) do nome do ad,
// cruza com vendas reais no Shopify (BigQuery) + busca imagens via Shopify Admin GraphQL.
// Mostra: thumbnail do criativo, imagem do produto/collection, tag "Com ads"/"Sem ads", ROAS real.

import { useEffect, useMemo, useState } from 'react';
import { extractAdRefFromName, extractUniqueRefs, type AdRef } from '@/lib/meta-ads-native/sku-extractor';
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';
import type { AdRow, Region } from '@/lib/meta-ads-native/types';

interface SkuPerf {
  units: number;
  revenue: number;
  productName: string | null;
  productImage: string | null;
  currency: 'USD' | 'BRL';
}
interface CollectionPerf {
  title: string | null;
  image: string | null;
  productCount: number;
  units: number;
  revenue: number;
  currency: 'USD' | 'BRL';
}

interface Props {
  ads: AdRow[];
  region: Region;
  since: string;
  until: string;
  currency: string;
}

interface RowComputed {
  ad: AdRow;
  ref: AdRef;
  shopifyUnits: number;
  shopifyRevenue: number;
  productName: string | null;
  productImage: string | null;
  productCount?: number;
  spend: number;
  roasReal: number;
  roasMeta: number;
  hasAds: boolean;
}

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 48 48\'><rect width=\'48\' height=\'48\' fill=\'%23eee\'/><text x=\'24\' y=\'28\' text-anchor=\'middle\' font-size=\'10\' fill=\'%23999\'>—</text></svg>';

type FilterMode = 'all' | 'sku' | 'collection';

export default function CreativesTab({ ads, region, since, until, currency }: Props) {
  const [skuPerf, setSkuPerf] = useState<Record<string, SkuPerf>>({});
  const [colPerf, setColPerf] = useState<Record<string, CollectionPerf>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');

  const refs = useMemo(() => extractUniqueRefs(ads.map(a => a.name)), [ads]);

  useEffect(() => {
    if (refs.skus.length === 0 && refs.collections.length === 0) {
      setSkuPerf({}); setColPerf({});
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    fetch('/api/meta-ads-native/creatives-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market: region, since, until, skus: refs.skus, collections: refs.collections }),
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) {
          setSkuPerf(data.skus || {});
          setColPerf(data.collections || {});
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region, since, until, refs.skus.join(','), refs.collections.join(',')]);

  const rows: RowComputed[] = useMemo(() => {
    return ads.map(ad => {
      const ref = extractAdRefFromName(ad.name);
      let shopifyUnits = 0, shopifyRevenue = 0;
      let productName: string | null = null;
      let productImage: string | null = null;
      let productCount: number | undefined;
      if (ref?.type === 'sku') {
        const p = skuPerf[ref.value];
        if (p) {
          shopifyUnits = p.units;
          shopifyRevenue = p.revenue;
          productName = p.productName;
          productImage = p.productImage;
        }
      } else if (ref?.type === 'collection') {
        const c = colPerf[ref.value];
        if (c) {
          shopifyUnits = c.units;
          shopifyRevenue = c.revenue;
          productName = c.title;
          productImage = c.image;
          productCount = c.productCount;
        }
      }
      const spend = ad.spend || 0;
      const roasReal = spend > 0 ? shopifyRevenue / spend : 0;
      // "Com ads" = está com spend > 0 no período. "Sem ads" = ad existe mas sem spend (pausado).
      const hasAds = spend > 0;
      return {
        ad, ref,
        shopifyUnits, shopifyRevenue, productName, productImage, productCount,
        spend, roasReal,
        roasMeta: ad.roas || 0,
        hasAds,
      };
    }).sort((a, b) => b.spend - a.spend || b.shopifyRevenue - a.shopifyRevenue);
  }, [ads, skuPerf, colPerf]);

  const totalAds = ads.length;
  const skuRows = rows.filter(r => r.ref?.type === 'sku');
  const colRows = rows.filter(r => r.ref?.type === 'collection');
  const skuDetected = skuRows.length;
  const colDetected = colRows.length;
  const matched = rows.filter(r => r.ref && (r.shopifyUnits > 0 || r.shopifyRevenue > 0)).length;
  const withAds = rows.filter(r => r.hasAds).length;

  // Cassia 2026-06-14: totais por tipo (SKU / Collection) — revenue, spend, roas
  const sumByType = (list: RowComputed[]) => {
    let revenue = 0, spend = 0, units = 0;
    for (const r of list) {
      revenue += r.shopifyRevenue;
      spend += r.spend;
      units += r.shopifyUnits;
    }
    return { revenue, spend, units, roas: spend > 0 ? revenue / spend : 0 };
  };
  const skuTotals = useMemo(() => sumByType(skuRows), [skuRows]);
  const colTotals = useMemo(() => sumByType(colRows), [colRows]);

  // Aplicar filtro
  const visibleRows = filter === 'all' ? rows : rows.filter(r => r.ref?.type === filter);

  const ALL_BG = filter === 'all' ? 'var(--pink-deep)' : 'transparent';
  const ALL_COLOR = filter === 'all' ? 'white' : 'var(--ink-soft)';
  const SKU_BG = filter === 'sku' ? 'var(--pink-deep)' : 'transparent';
  const SKU_COLOR = filter === 'sku' ? 'white' : 'var(--ink-soft)';
  const COL_BG = filter === 'collection' ? 'var(--pink-deep)' : 'transparent';
  const COL_COLOR = filter === 'collection' ? 'white' : 'var(--ink-soft)';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Creatives × Shopify performance</h3>
          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            Cruzamento entre criativos Meta (SKU ou Collection ID no nome do ad) e vendas reais no Shopify.
          </p>
        </div>
        <div className="text-[10px] text-right" style={{ color: 'var(--ink-muted)' }}>
          {totalAds} ads · {skuDetected} SKU · {colDetected} Coleção · {matched} c/ vendas · {withAds} c/ spend &gt; 0
          {loading && ' · loading…'}
          {error && ` · error: ${error}`}
        </div>
      </div>

      {/* Cassia 2026-06-14: summary cards SKU vs Collection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg p-3" style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.2)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pink-deep)' }}>SKU (produtos individuais)</div>
            <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{skuDetected} ads</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>Faturamento</div>
              <div className="font-num font-bold text-[14px]" style={{ color: '#10b981' }}>{formatCurrency(skuTotals.revenue, currency, true)}</div>
              <div className="text-[9px]" style={{ color: 'var(--ink-muted)' }}>{formatNumber(skuTotals.units)} units</div>
            </div>
            <div>
              <div className="text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>Investimento</div>
              <div className="font-num font-bold text-[14px]" style={{ color: 'var(--ink)' }}>{formatCurrency(skuTotals.spend, currency, true)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>ROAS real</div>
              <div className="font-num font-bold text-[14px]" style={{ color: skuTotals.roas >= 1 ? '#10b981' : skuTotals.roas > 0 ? '#f59e0b' : 'var(--ink-muted)' }}>
                {skuTotals.roas > 0 ? `${formatDecimal(skuTotals.roas)}×` : '—'}
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#7c3aed' }}>🗂 Coleção</div>
            <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{colDetected} ads</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>Faturamento</div>
              <div className="font-num font-bold text-[14px]" style={{ color: '#10b981' }}>{formatCurrency(colTotals.revenue, currency, true)}</div>
              <div className="text-[9px]" style={{ color: 'var(--ink-muted)' }}>{formatNumber(colTotals.units)} units</div>
            </div>
            <div>
              <div className="text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>Investimento</div>
              <div className="font-num font-bold text-[14px]" style={{ color: 'var(--ink)' }}>{formatCurrency(colTotals.spend, currency, true)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>ROAS real</div>
              <div className="font-num font-bold text-[14px]" style={{ color: colTotals.roas >= 1 ? '#10b981' : colTotals.roas > 0 ? '#f59e0b' : 'var(--ink-muted)' }}>
                {colTotals.roas > 0 ? `${formatDecimal(colTotals.roas)}×` : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-muted)' }}>Filtrar:</span>
        <button onClick={() => setFilter('all')} className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all" style={{ background: ALL_BG, color: ALL_COLOR, border: '1px solid var(--border)' }}>
          Todos ({rows.length})
        </button>
        <button onClick={() => setFilter('sku')} className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all" style={{ background: SKU_BG, color: SKU_COLOR, border: '1px solid var(--border)' }}>
          SKU ({skuDetected})
        </button>
        <button onClick={() => setFilter('collection')} className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all" style={{ background: COL_BG, color: COL_COLOR, border: '1px solid var(--border)' }}>
          🗂 Coleção ({colDetected})
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
            <tr>
              <th className="text-left px-2 py-1.5">Creative</th>
              <th className="text-left px-2 py-1.5">Product / Collection</th>
              <th className="text-left px-2 py-1.5">Status</th>
              <th className="text-left px-2 py-1.5">Ref</th>
              <th className="text-right px-2 py-1.5">Units sold</th>
              <th className="text-right px-2 py-1.5">Shopify revenue</th>
              <th className="text-right px-2 py-1.5">Ad spend</th>
              <th className="text-right px-2 py-1.5">ROAS real</th>
              <th className="text-right px-2 py-1.5">ROAS Meta</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-6 text-center" style={{ color: 'var(--ink-muted)' }}>No creatives match the selected filter.</td></tr>
            )}
            {visibleRows.slice(0, 100).map((r, i) => {
              const adThumb = (r.ad as any).thumbnail || FALLBACK_IMG;
              const prodImg = r.productImage || FALLBACK_IMG;
              const isCollection = r.ref?.type === 'collection';
              return (
                <tr key={`${r.ad.id}-${i}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  {/* Creative — thumbnail + ad name */}
                  <td className="px-2 py-1.5 max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <img
                        src={adThumb}
                        alt=""
                        width={40} height={40}
                        style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#eee' }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate" style={{ color: 'var(--ink)' }} title={r.ad.name}>{r.ad.name}</div>
                        <div className="text-[9px]" style={{ color: 'var(--ink-muted)' }}>{r.ad.account}</div>
                      </div>
                    </div>
                  </td>
                  {/* Product / Collection — image + name */}
                  <td className="px-2 py-1.5 max-w-[220px]">
                    <div className="flex items-center gap-2">
                      <img
                        src={prodImg}
                        alt=""
                        width={36} height={36}
                        style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#eee' }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }}
                      />
                      <div className="min-w-0">
                        <div className="truncate" style={{ color: r.productName ? 'var(--ink)' : 'var(--ink-muted)' }} title={r.productName || ''}>
                          {r.productName || (r.ref ? '—' : '(no ref)')}
                        </div>
                        {isCollection && r.productCount != null && (
                          <div className="text-[9px]" style={{ color: 'var(--ink-muted)' }}>{r.productCount} products</div>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Status: Com ads / Sem ads */}
                  <td className="px-2 py-1.5">
                    {r.hasAds ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                        Com ads
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(156,163,175,0.15)', color: '#6b7280' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af' }} />
                        Sem ads
                      </span>
                    )}
                  </td>
                  {/* Ref (SKU or Collection) */}
                  <td className="px-2 py-1.5">
                    {r.ref?.type === 'sku' ? (
                      <span className="font-mono font-semibold text-[11px]" style={{ color: 'var(--pink-deep)' }}>{r.ref.value}</span>
                    ) : r.ref?.type === 'collection' ? (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed' }} title={`Collection ${r.ref.value}`}>
                        🗂 Col
                      </span>
                    ) : (
                      <span className="text-[10px] italic" style={{ color: 'var(--ink-muted)' }}>—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.shopifyUnits)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.shopifyRevenue, currency, true)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.spend, currency, true)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: r.roasReal >= 1 ? '#10b981' : r.roasReal > 0 ? '#f59e0b' : 'var(--ink-muted)' }}>
                    {r.roasReal > 0 ? `${formatDecimal(r.roasReal)}×` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                    {r.roasMeta > 0 ? `${formatDecimal(r.roasMeta)}×` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] mt-3 italic" style={{ color: 'var(--ink-muted)' }}>
        <strong>Como ler:</strong> Ref pode ser <strong>SKU</strong> (regex <code>\bL\d{'{3,5}'}\b</code>, ex: <code>L0042</code>) ou <strong>Collection ID</strong> (12+ dígitos, ex: <code>285632184302</code>).
        {' '}Tag "Com ads" = criativo com spend &gt; 0 no período. "Sem ads" = criativo cadastrado mas pausado/sem spend.
        {' '}Vendas Shopify (DTC, exclui B2B + PIX não-pago). ROAS real = revenue Shopify / spend Meta.
      </div>
    </div>
  );
}

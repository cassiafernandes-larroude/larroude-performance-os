'use client';
// Cassia 2026-06-14: aba Creatives × Shopify — extrai SKU do nome do ad,
// cruza com vendas reais no Shopify (BigQuery) no período selecionado.
// Mostra ROAS REAL = revenue Shopify / spend Meta.

import { useEffect, useMemo, useState } from 'react';
import { extractSkuFromAdName, extractUniqueSkus } from '@/lib/meta-ads-native/sku-extractor';
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';
import type { AdRow, Region } from '@/lib/meta-ads-native/types';

interface SkuPerf {
  units: number;
  revenue: number;
  productName: string | null;
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
  sku: string | null;
  shopifyUnits: number;
  shopifyRevenue: number;
  productName: string | null;
  spend: number;
  roasReal: number;          // shopifyRevenue / spend
  roasMeta: number;          // ad.roas (declarado pelo Meta)
}

export default function CreativesTab({ ads, region, since, until, currency }: Props) {
  const [perfBySku, setPerfBySku] = useState<Record<string, SkuPerf>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SKUs únicos que aparecem nos nomes dos criativos
  const uniqueSkus = useMemo(() => extractUniqueSkus(ads.map(a => a.name)), [ads]);

  useEffect(() => {
    if (uniqueSkus.length === 0) {
      setPerfBySku({});
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    fetch('/api/meta-ads-native/creatives-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market: region, since, until, skus: uniqueSkus }),
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setPerfBySku(data);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region, since, until, uniqueSkus.join(',')]);

  const rows: RowComputed[] = useMemo(() => {
    return ads.map(ad => {
      const sku = extractSkuFromAdName(ad.name);
      const perf = sku ? perfBySku[sku] : undefined;
      const shopifyRevenue = perf?.revenue ?? 0;
      const shopifyUnits = perf?.units ?? 0;
      const productName = perf?.productName ?? null;
      const spend = ad.spend || 0;
      const roasReal = spend > 0 ? shopifyRevenue / spend : 0;
      return {
        ad,
        sku,
        shopifyUnits,
        shopifyRevenue,
        productName,
        spend,
        roasReal,
        roasMeta: ad.roas || 0,
      };
    }).sort((a, b) => b.spend - a.spend);
  }, [ads, perfBySku]);

  const totalAds = ads.length;
  const matched = rows.filter(r => r.sku && (r.shopifyUnits > 0 || r.shopifyRevenue > 0)).length;
  const skuDetected = rows.filter(r => r.sku).length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Creatives × Shopify performance</h3>
          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            Cruzamento entre criativos Meta e vendas reais no Shopify por SKU.
          </p>
        </div>
        <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
          {totalAds} ads · {skuDetected} com SKU detectado · {matched} com vendas no Shopify
          {loading && ' · loading…'}
          {error && ` · error: ${error}`}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
            <tr>
              <th className="text-left px-2 py-1.5">Creative (Ad name)</th>
              <th className="text-left px-2 py-1.5">SKU</th>
              <th className="text-left px-2 py-1.5">Product (Shopify)</th>
              <th className="text-right px-2 py-1.5">Units sold</th>
              <th className="text-right px-2 py-1.5">Shopify revenue</th>
              <th className="text-right px-2 py-1.5">Ad spend</th>
              <th className="text-right px-2 py-1.5">ROAS real</th>
              <th className="text-right px-2 py-1.5">ROAS Meta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-6 text-center" style={{ color: 'var(--ink-muted)' }}>No creatives in selected period.</td></tr>
            )}
            {rows.slice(0, 100).map((r, i) => {
              const noSku = !r.sku;
              const noMatch = r.sku && r.shopifyUnits === 0 && r.shopifyRevenue === 0;
              return (
                <tr key={`${r.ad.id}-${i}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-2 py-1.5 max-w-[300px] truncate font-medium" style={{ color: 'var(--ink)' }} title={r.ad.name}>
                    {r.ad.name}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.sku ? (
                      <span className="font-mono font-semibold" style={{ color: 'var(--pink-deep)' }}>{r.sku}</span>
                    ) : (
                      <span style={{ color: 'var(--ink-muted)' }} className="italic text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 max-w-[200px] truncate" style={{ color: 'var(--ink-soft)' }} title={r.productName || ''}>
                    {r.productName || (noSku ? '' : noMatch ? <span className="italic text-[10px]" style={{ color: 'var(--ink-muted)' }}>no sales</span> : '')}
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
        SKU é extraído do nome do anúncio via regex <code>\bL\d{'{3,5}'}\b</code> (ex: "Adriana <strong>L0042</strong> coleção" → L0042).
        {' '}Faturamento Shopify e unidades são apenas DTC (exclui B2B + PIX não-pago) no período selecionado.
        {' '}ROAS real = revenue Shopify / spend Meta. ROAS Meta = atribuição via pixel (conversions / spend).
      </div>
    </div>
  );
}

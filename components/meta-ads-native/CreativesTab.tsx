'use client';
// Cassia 2026-06-14: Top SKUs por vendas Shopify + criativos Meta agregados por SKU.
// Quadro 1: Top 30 SKUs mais vendidos (com fotos, units, faturamento, tag ads, criativos, spend, ROAS, purchases)
// Quadro 2: SKUs com ads ativos FORA do top 30
// Cada SKU expande pra ver os criativos individuais (nome, campanha, adset, spend, purchases, ROAS).

import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';
import type { AdRow, Region } from '@/lib/meta-ads-native/types';

interface AdDetail {
  id: string;
  name: string;
  account: string;
  campaignName: string | null;
  adsetName: string | null;
  thumbnail: string | null;
  spend: number;
  purchases: number;
  status: string | null;
  effectiveStatus: string | null;
  isActive: boolean;
}
interface SkuRow {
  sku: string;
  productName: string | null;
  productImage: string | null;
  unitsSold: number;
  shopifyRevenue: number;
  currency: 'USD' | 'BRL';
  hasAds: boolean;           // tem ad ATIVO no momento
  hasAdsHistory: boolean;    // teve ad no período (pode estar pausado agora)
  adsSpend: number;
  adsPurchases: number;
  roasReal: number;
  ads: AdDetail[];            // SÓ ativos
  totalAdsCount: number;
  activeAdsCount: number;
  campaigns: string[];
  // Cassia 2026-07-02: margem — null quando COGS indisponível (colunas ficam ocultas)
  cogsPerUnit: number | null;
  contributionMargin: number | null;
  mroas: number | null;
}

interface Props {
  ads: AdRow[];
  region: Region;
  since: string;
  until: string;
  currency: string;
}

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 48 48\'><rect width=\'48\' height=\'48\' fill=\'%23eee\'/><text x=\'24\' y=\'28\' text-anchor=\'middle\' font-size=\'10\' fill=\'%23999\'>—</text></svg>';

export default function CreativesTab({ ads, region, since, until, currency }: Props) {
  const [top, setTop] = useState<SkuRow[]>([]);
  const [otherWithAds, setOtherWithAds] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const adsPayload = ads.map(a => ({
      id: a.id,
      name: a.name,
      account: a.account,
      campaignName: (a as any).campaignName ?? null,
      adsetName: (a as any).adsetName ?? null,
      thumbnail: (a as any).thumbnail ?? null,
      spend: a.spend || 0,
      purchases: a.purchases || 0,
      status: (a as any).status ?? null,
      effectiveStatus: (a as any).effectiveStatus ?? null,
    }));
    fetch('/api/meta-ads-native/skus-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market: region, since, until, ads: adsPayload, limit: 30 }),
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) {
          setTop(data.top || []);
          setOtherWithAds(data.otherWithAds || []);
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region, since, until, ads.length]);

  // Totais
  const topTotals = useMemo(() => {
    let revenue = 0, spend = 0, units = 0, purchases = 0;
    for (const r of top) {
      revenue += r.shopifyRevenue; spend += r.adsSpend; units += r.unitsSold; purchases += r.adsPurchases;
    }
    return { revenue, spend, units, purchases, roas: spend > 0 ? revenue / spend : 0 };
  }, [top]);

  const otherTotals = useMemo(() => {
    let revenue = 0, spend = 0, units = 0, purchases = 0;
    for (const r of otherWithAds) {
      revenue += r.shopifyRevenue; spend += r.adsSpend; units += r.unitsSold; purchases += r.adsPurchases;
    }
    return { revenue, spend, units, purchases, roas: spend > 0 ? revenue / spend : 0 };
  }, [otherWithAds]);

  // Cassia 2026-07-02: se o fetch de COGS falhou no endpoint, TODAS as rows vêm com
  // cogsPerUnit=null → esconde as colunas mROAS/CM em vez de mostrar tudo "—".
  const showMargin = useMemo(
    () => [...top, ...otherWithAds].some(r => r.cogsPerUnit != null),
    [top, otherWithAds]
  );

  return (
    <div className="space-y-6">
      {loading && (
        <div className="card text-center py-8" style={{ color: 'var(--ink-soft)' }}>Loading SKUs × Shopify data…</div>
      )}
      {error && (
        <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm">Error: {error}</div>
      )}

      {/* QUADRO 1 — Top 30 SKUs */}
      <SkuQuadro
        title="Top 30 SKUs mais vendidos no Shopify"
        subtitle="Ranking por unidades vendidas (DTC). Cada SKU mostra criativos Meta associados via nome do ad (regex L\\d{3,5})."
        rows={top}
        totals={topTotals}
        currency={currency}
        expandedSku={expandedSku}
        onToggle={(sku) => setExpandedSku(prev => prev === sku ? null : sku)}
        accent="#10b981"
        showMargin={showMargin}
      />

      {/* QUADRO 2 — SKUs fora do top 30 mas com ads ativos */}
      {otherWithAds.length > 0 && (
        <SkuQuadro
          title="SKUs com ads ATIVOS fora do Top 30"
          subtitle="Produtos investidos em Meta que NÃO estão entre os 30 mais vendidos. Avalie ROAS pra decidir pausar/escalar."
          rows={otherWithAds}
          totals={otherTotals}
          currency={currency}
          expandedSku={expandedSku}
          onToggle={(sku) => setExpandedSku(prev => prev === sku ? null : sku)}
          accent="#f59e0b"
          showMargin={showMargin}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-componente: quadro de SKUs
// ----------------------------------------------------------------------------
function SkuQuadro({
  title, subtitle, rows, totals, currency, expandedSku, onToggle, accent, showMargin,
}: {
  title: string;
  subtitle: string;
  rows: SkuRow[];
  totals: { revenue: number; spend: number; units: number; purchases: number; roas: number };
  currency: string;
  expandedSku: string | null;
  onToggle: (sku: string) => void;
  accent: string;
  showMargin: boolean;
}) {
  const colCount = showMargin ? 11 : 9;
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>{title}</h3>
          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{subtitle}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:items-center gap-2 lg:gap-3 text-[11px] w-full lg:w-auto">
          <Stat label="Faturamento" value={formatCurrency(totals.revenue, currency, true)} color="#10b981" />
          <Stat label="Investimento" value={formatCurrency(totals.spend, currency, true)} color="var(--ink)" />
          <Stat label="ROAS" value={totals.roas > 0 ? `${formatDecimal(totals.roas)}×` : '—'} color={totals.roas >= 1 ? '#10b981' : totals.roas > 0 ? '#f59e0b' : 'var(--ink-muted)'} />
          <Stat label="Units" value={formatNumber(totals.units)} color="var(--ink-soft)" />
          <Stat label="Purchases" value={formatNumber(totals.purchases)} color="var(--ink-soft)" />
        </div>
      </div>
      <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-[11px] sm:text-[12px] min-w-[800px]">
          <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
            <tr>
              <th className="text-left px-2 py-1.5" style={{ width: 40 }}>#</th>
              <th className="text-left px-2 py-1.5">Produto</th>
              <th className="text-right px-2 py-1.5">Units</th>
              <th className="text-right px-2 py-1.5">Shopify rev</th>
              <th className="text-left px-2 py-1.5">Ads</th>
              <th className="text-left px-2 py-1.5">Criativos</th>
              <th className="text-right px-2 py-1.5">Spend</th>
              <th className="text-right px-2 py-1.5">ROAS</th>
              {showMargin && (
                <>
                  <th className="text-right px-2 py-1.5" title="(Revenue − COGS) / Spend">mROAS</th>
                  <th className="text-right px-2 py-1.5" title="Revenue − COGS − Spend">CM</th>
                </>
              )}
              <th className="text-right px-2 py-1.5">Purchases</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={colCount} className="px-2 py-6 text-center" style={{ color: 'var(--ink-muted)' }}>No data in selected period.</td></tr>
            )}
            {rows.map((r, idx) => {
              const expanded = expandedSku === r.sku;
              const prodImg = r.productImage || FALLBACK_IMG;
              return (
                <>
                  <tr key={`${r.sku}-row`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: 'var(--ink-muted)' }}>{idx + 1}</td>
                    {/* Produto com foto + campanhas */}
                    <td className="px-2 py-1.5 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        <img src={prodImg} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#eee' }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }} />
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-semibold" style={{ color: 'var(--pink-deep)' }}>{r.sku}</div>
                          <div className="truncate text-[11px]" style={{ color: 'var(--ink)' }} title={r.productName || ''}>{r.productName || '—'}</div>
                          {r.campaigns.length > 0 && (
                            <div className="truncate text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }} title={r.campaigns.join(' · ')}>
                              📣 {r.campaigns.length === 1 ? r.campaigns[0] : `${r.campaigns[0]} +${r.campaigns.length - 1}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatNumber(r.unitsSold)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.shopifyRevenue, currency, true)}</td>
                    {/* Tag Com ads / Sem ads */}
                    <td className="px-2 py-1.5">
                      {(() => {
                        const active = r.activeAdsCount;
                        const total = r.totalAdsCount;
                        const inactive = Math.max(0, total - active);
                        if (active > 0) {
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                              Com ads ({active}{inactive > 0 ? ` + ${inactive} off` : ''})
                            </span>
                          );
                        }
                        if (total > 0) {
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(156,163,175,0.18)', color: '#6b7280' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af' }} />
                              Sem ads ativos ({total} off)
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(156,163,175,0.15)', color: '#6b7280' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af' }} />
                            Sem ads
                          </span>
                        );
                      })()}
                    </td>
                    {/* Criativos thumbnails clicáveis */}
                    <td className="px-2 py-1.5">
                      {r.ads.length > 0 ? (
                        <button
                          onClick={() => onToggle(r.sku)}
                          className="flex items-center gap-1"
                          title={expanded ? 'Hide creatives' : 'Show creatives'}
                        >
                          {r.ads.slice(0, 4).map((a, i) => (
                            <img
                              key={a.id}
                              src={a.thumbnail || FALLBACK_IMG}
                              alt=""
                              width={26} height={26}
                              style={{ borderRadius: 4, objectFit: 'cover', background: '#eee', border: '1px solid var(--border)', marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i }}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }}
                            />
                          ))}
                          {r.ads.length > 4 && (
                            <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded" style={{ background: 'var(--paper)', color: 'var(--ink-muted)' }}>+{r.ads.length - 4}</span>
                          )}
                          <span className="text-[10px] ml-1" style={{ color: 'var(--ink-muted)' }}>{expanded ? '▴' : '▾'}</span>
                        </button>
                      ) : (
                        <span className="text-[10px] italic" style={{ color: 'var(--ink-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.adsSpend > 0 ? formatCurrency(r.adsSpend, currency, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: r.roasReal >= 1 ? '#10b981' : r.roasReal > 0 ? '#f59e0b' : 'var(--ink-muted)' }}>
                      {r.roasReal > 0 ? `${formatDecimal(r.roasReal)}×` : '—'}
                    </td>
                    {showMargin && (
                      <>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold" title="(Revenue − COGS) / Spend" style={{ color: r.mroas == null ? 'var(--ink-muted)' : r.mroas >= 1 ? '#10b981' : '#f59e0b' }}>
                          {r.mroas != null ? `${formatDecimal(r.mroas)}×` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums" title="Revenue − COGS − Spend" style={{ color: r.contributionMargin == null ? 'var(--ink-muted)' : r.contributionMargin >= 0 ? '#10b981' : '#ef4444' }}>
                          {r.contributionMargin != null ? formatCurrency(r.contributionMargin, currency, true) : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.adsPurchases)}</td>
                  </tr>
                  {expanded && r.ads.length > 0 && (
                    <tr key={`${r.sku}-detail`} style={{ background: 'var(--paper)' }}>
                      <td colSpan={colCount} className="px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--ink-muted)' }}>Criativos deste SKU</div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                          {r.ads.map(ad => {
                            const effStatus = (ad.effectiveStatus || ad.status || 'UNKNOWN').toUpperCase();
                            const isAct = ad.isActive || effStatus === 'ACTIVE';
                            // Cassia 2026-06-14: se não é ATIVO (incluindo UNKNOWN/PAUSED/etc), trata como "Off"
                            const isDisapproved = effStatus.includes('DISAPPROVED') || effStatus.includes('DELETED') || effStatus.includes('ARCHIVED');
                            const statusColor = isAct ? '#10b981' : isDisapproved ? '#ef4444' : '#9ca3af';
                            const statusBg = isAct ? 'rgba(13,148,136,0.12)' : isDisapproved ? 'rgba(239,68,68,0.12)' : 'rgba(156,163,175,0.18)';
                            // No card individual de cada criativo, mostra status REAL do ad.
                            const statusLabel = isAct
                              ? 'Ativo'
                              : isDisapproved
                                ? (effStatus.includes('DISAPPROVED') ? 'Reprovado' : effStatus.includes('ARCHIVED') ? 'Arquivado' : 'Excluído')
                                : 'Off';
                            return (
                              <div key={ad.id} className="flex items-start gap-2 p-2 rounded" style={{ background: 'white', border: '1px solid var(--border)' }}>
                                <img src={ad.thumbnail || FALLBACK_IMG} alt="" width={56} height={56} style={{ borderRadius: 6, objectFit: 'cover', background: '#eee', flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <div className="font-medium text-[11px] truncate flex-1" style={{ color: 'var(--ink)' }} title={ad.name} data-no-translate="true">{ad.name}</div>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap" style={{ background: statusBg, color: statusColor }}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
                                      {statusLabel}
                                    </span>
                                  </div>
                                  <div className="text-[10px] truncate" style={{ color: 'var(--ink-soft)' }} title={`Campanha: ${ad.campaignName || '—'}`}>
                                    <strong>Campanha:</strong> <span data-no-translate="true">{ad.campaignName || '—'}</span>
                                  </div>
                                  <div className="text-[10px] truncate" style={{ color: 'var(--ink-soft)' }} title={`Adset: ${ad.adsetName || '—'}`}>
                                    <strong>Ad set:</strong> <span data-no-translate="true">{ad.adsetName || '—'}</span>
                                  </div>
                                  <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{ad.account}</div>
                                  <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                                    <span><b>Spend:</b> {formatCurrency(ad.spend, currency, true)}</span>
                                    <span><b>Purch:</b> {formatNumber(ad.purchases)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-left lg:text-right p-1.5 lg:p-0 rounded lg:rounded-none" style={{ background: 'var(--paper)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</div>
      <div className="font-num font-bold text-[13px]" style={{ color }}>{value}</div>
    </div>
  );
}

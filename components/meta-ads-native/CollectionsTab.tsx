'use client';
// Cassia 2026-06-21: Creatives × Collections — anúncios de coleção (ID no nome do ad) agrupados
// por coleção, com nome resolvido no Shopify. Espelha a CreativesTab (× Products).

import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';
import type { Region } from '@/lib/meta-ads-native/types';

interface AdDetail {
  id: string; name: string; account: string; campaignName: string | null; adsetName: string | null;
  thumbnail: string | null; spend: number; purchases: number; status: string | null; effectiveStatus: string | null; isActive: boolean;
}
interface CollectionRow {
  id: string; name: string | null; image: string | null; productCount: number;
  spend: number; purchases: number; revenue: number; roas: number; sessions: number; convRate: number;
  activeAdsCount: number; totalAdsCount: number; ads: AdDetail[];
}
interface Props { region: Region; since: string; until: string; currency: string; }

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 48 48\'><rect width=\'48\' height=\'48\' fill=\'%23eee\'/><text x=\'24\' y=\'28\' text-anchor=\'middle\' font-size=\'10\' fill=\'%23999\'>—</text></svg>';

export default function CollectionsTab({ region, since, until, currency }: Props) {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/meta-ads-native/collections-performance?region=${region}&since=${since}&until=${until}`)
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { if (!cancelled) setRows(data.collections || []); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region, since, until]);

  const totals = useMemo(() => {
    let spend = 0, revenue = 0, purchases = 0, sessions = 0;
    for (const r of rows) { spend += r.spend; revenue += r.revenue; purchases += r.purchases; sessions += r.sessions; }
    return { spend, revenue, purchases, sessions, roas: spend > 0 ? revenue / spend : 0, convRate: sessions > 0 ? (purchases / sessions) * 100 : 0 };
  }, [rows]);

  // Cassia 2026-06-21: oportunidades = coleções que geraram tráfego relevante no período
  // (>= REACTIVATE_MIN_SESSIONS sessões via ads) mas que NÃO têm nenhum ad ativo agora.
  // Candidatas a reativar criativo. Sessões = landing page views dos ads no período.
  const opportunities = useMemo(
    () => rows.filter((r) => r.activeAdsCount === 0 && r.sessions >= REACTIVATE_MIN_SESSIONS).sort((a, b) => b.sessions - a.sessions),
    [rows]
  );

  return (
    <div className="space-y-6">
      {loading && <div className="card text-center py-8" style={{ color: 'var(--ink-soft)' }}>Loading collections × creatives…</div>}
      {error && <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm">Error: {error}</div>}

      {!loading && (
        <div className="card" style={{ borderTop: '3px solid #5d4ec5' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Coleções anunciadas no Meta</h3>
              <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>Anúncios agrupados pelo ID da coleção no nome do ad (catálogo/collection). Nome resolvido no Shopify.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:items-center gap-2 lg:gap-3 text-[11px] w-full lg:w-auto">
              <Stat label="Coleções" value={formatNumber(rows.length)} color="#5d4ec5" />
              <Stat label="Investimento" value={formatCurrency(totals.spend, currency, true)} color="var(--ink)" />
              <Stat label="Sessões" value={formatNumber(totals.sessions)} color="var(--ink)" />
              <Stat label="Conv. %" value={totals.convRate > 0 ? `${formatDecimal(totals.convRate)}%` : '—'} color="#5d4ec5" />
              <Stat label="Valor (Meta)" value={formatCurrency(totals.revenue, currency, true)} color="#10b981" />
              <Stat label="ROAS" value={totals.roas > 0 ? `${formatDecimal(totals.roas)}×` : '—'} color={totals.roas >= 1 ? '#10b981' : totals.roas > 0 ? '#f59e0b' : 'var(--ink-muted)'} />
            </div>
          </div>
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-[11px] sm:text-[12px] min-w-[820px]">
              <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
                <tr>
                  <th className="text-left px-2 py-1.5" style={{ width: 40 }}>#</th>
                  <th className="text-left px-2 py-1.5">Coleção</th>
                  <th className="text-left px-2 py-1.5">Ads</th>
                  <th className="text-left px-2 py-1.5">Criativos</th>
                  <th className="text-right px-2 py-1.5">Investimento</th>
                  <th className="text-right px-2 py-1.5">Sessões</th>
                  <th className="text-right px-2 py-1.5">Conv. %</th>
                  <th className="text-right px-2 py-1.5">Valor (Meta)</th>
                  <th className="text-right px-2 py-1.5">ROAS</th>
                  <th className="text-right px-2 py-1.5">Compras</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={10} className="px-2 py-6 text-center" style={{ color: 'var(--ink-muted)' }}>Nenhum anúncio de coleção no período.</td></tr>}
                {rows.map((r, idx) => {
                  const isOpen = expanded === r.id;
                  return (
                    <>
                      <tr key={`${r.id}-row`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: 'var(--ink-muted)' }}>{idx + 1}</td>
                        <td className="px-2 py-1.5 max-w-[300px]">
                          <div className="flex items-center gap-2">
                            <img src={r.image || FALLBACK_IMG} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#eee' }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }} />
                            <div className="min-w-0">
                              <div className="truncate text-[12px] font-semibold" style={{ color: 'var(--ink)' }} title={r.name || r.id} data-no-translate="true">{r.name || `Coleção ${r.id}`}</div>
                              <div className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>ID {r.id}{r.productCount > 0 ? ` · ${r.productCount} produtos` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {r.activeAdsCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                              Com ads ({r.activeAdsCount}{r.totalAdsCount > r.activeAdsCount ? ` + ${r.totalAdsCount - r.activeAdsCount} off` : ''})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(156,163,175,0.18)', color: '#6b7280' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af' }} />
                              {r.totalAdsCount} off
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.ads.length > 0 ? (
                            <button onClick={() => setExpanded((p) => (p === r.id ? null : r.id))} className="flex items-center gap-1" title={isOpen ? 'Ocultar' : 'Ver criativos'}>
                              {r.ads.slice(0, 4).map((a, i) => (
                                <img key={a.id} src={a.thumbnail || FALLBACK_IMG} alt="" width={26} height={26} style={{ borderRadius: 4, objectFit: 'cover', background: '#eee', border: '1px solid var(--border)', marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }} />
                              ))}
                              {r.ads.length > 4 && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded" style={{ background: 'var(--paper)', color: 'var(--ink-muted)' }}>+{r.ads.length - 4}</span>}
                              <span className="text-[10px] ml-1" style={{ color: 'var(--ink-muted)' }}>{isOpen ? '▴' : '▾'}</span>
                            </button>
                          ) : <span className="text-[10px] italic" style={{ color: 'var(--ink-muted)' }}>—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.spend > 0 ? formatCurrency(r.spend, currency, true) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.sessions > 0 ? formatNumber(r.sessions) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.sessions > 0 ? `${formatDecimal(r.convRate)}%` : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.revenue, currency, true)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: r.roas >= 1 ? '#10b981' : r.roas > 0 ? '#f59e0b' : 'var(--ink-muted)' }}>{r.roas > 0 ? `${formatDecimal(r.roas)}×` : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.purchases)}</td>
                      </tr>
                      {isOpen && r.ads.length > 0 && (
                        <tr key={`${r.id}-detail`} style={{ background: 'var(--paper)' }}>
                          <td colSpan={10} className="px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--ink-muted)' }}>Criativos desta coleção</div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                              {r.ads.map((ad) => {
                                const eff = (ad.effectiveStatus || ad.status || 'UNKNOWN').toUpperCase();
                                const isAct = ad.isActive || eff === 'ACTIVE';
                                const statusColor = isAct ? '#10b981' : '#9ca3af';
                                const statusBg = isAct ? 'rgba(13,148,136,0.12)' : 'rgba(156,163,175,0.18)';
                                return (
                                  <div key={ad.id} className="flex items-start gap-2 p-2 rounded" style={{ background: 'white', border: '1px solid var(--border)' }}>
                                    <img src={ad.thumbnail || FALLBACK_IMG} alt="" width={56} height={56} style={{ borderRadius: 6, objectFit: 'cover', background: '#eee', flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <div className="font-medium text-[11px] truncate flex-1" style={{ color: 'var(--ink)' }} title={ad.name} data-no-translate="true">{ad.name}</div>
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap" style={{ background: statusBg, color: statusColor }}>
                                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />{isAct ? 'Ativo' : 'Off'}
                                        </span>
                                      </div>
                                      <div className="text-[10px] truncate" style={{ color: 'var(--ink-soft)' }}><strong>Campanha:</strong> <span data-no-translate="true">{ad.campaignName || '—'}</span></div>
                                      <div className="text-[10px] truncate" style={{ color: 'var(--ink-soft)' }}><strong>Ad set:</strong> <span data-no-translate="true">{ad.adsetName || '—'}</span></div>
                                      <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{ad.account}</div>
                                      <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                                        <span><b>Spend:</b> {formatCurrency(ad.spend, currency, true)}</span>
                                        <span><b>Compras:</b> {formatNumber(ad.purchases)}</span>
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
      )}

      {!loading && opportunities.length > 0 && (
        <div className="card" style={{ borderTop: '3px solid #f59e0b' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-[15px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                <span style={{ color: '#f59e0b' }}>⚡</span> Oportunidades — tráfego sem ads ativos
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                Coleções que geraram <strong>≥ {formatNumber(REACTIVATE_MIN_SESSIONS)} sessões</strong> via anúncios no período, mas sem nenhum ad ativo agora. Candidatas a reativar criativo.
              </p>
            </div>
            <Stat label="Coleções" value={formatNumber(opportunities.length)} color="#f59e0b" />
          </div>
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-[11px] sm:text-[12px] min-w-[620px]">
              <thead style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
                <tr>
                  <th className="text-left px-2 py-1.5">Coleção</th>
                  <th className="text-right px-2 py-1.5">Sessões</th>
                  <th className="text-right px-2 py-1.5">Conv. %</th>
                  <th className="text-right px-2 py-1.5">Compras</th>
                  <th className="text-right px-2 py-1.5">ROAS hist.</th>
                  <th className="text-right px-2 py-1.5">Ads (off)</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((r) => (
                  <tr key={`${r.id}-opp`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        <img src={r.image || FALLBACK_IMG} alt="" width={36} height={36} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#eee' }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }} />
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold" style={{ color: 'var(--ink)' }} title={r.name || r.id} data-no-translate="true">{r.name || `Coleção ${r.id}`}</div>
                          <div className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>ID {r.id}{r.productCount > 0 ? ` · ${r.productCount} produtos` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatNumber(r.sessions)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.sessions > 0 ? `${formatDecimal(r.convRate)}%` : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.purchases)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: r.roas >= 1 ? '#10b981' : r.roas > 0 ? '#f59e0b' : 'var(--ink-muted)' }}>{r.roas > 0 ? `${formatDecimal(r.roas)}×` : '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(156,163,175,0.18)', color: '#6b7280' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af' }} />
                        {formatNumber(r.totalAdsCount)} off
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const REACTIVATE_MIN_SESSIONS = 100;

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-left lg:text-right p-1.5 lg:p-0 rounded lg:rounded-none" style={{ background: 'var(--paper)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</div>
      <div className="font-num font-bold text-[13px]" style={{ color }}>{value}</div>
    </div>
  );
}

'use client';
// Cassia 2026-06-14: Per-Campaign Optimization — para cada campanha, mostra até 5 slots
// com decisão de keep / refresh / pause / open baseada no ROAS de cada criativo.
//
// Regras:
//   ROAS ≥ 2     → KEEP    (verde)
//   1 ≤ ROAS < 2 → REFRESH (laranja)
//   ROAS < 1     → PAUSE   (vermelho)
//   slot vazio   → OPEN    (cinza tracejado)
//
// Campanhas limitam a 5 ads ativos no Meta — esse quadro ajuda a decidir o que
// pausar/renovar pra abrir vagas.

import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';
import type { AdRow } from '@/lib/meta-ads-native/types';

interface Props {
  ads: AdRow[];
  currency: string;
  maxAdsPerCampaign?: number;  // default 5
}

type Decision = 'keep' | 'refresh' | 'pause';

interface CampaignSummary {
  name: string;
  account: string;
  spend: number;
  revenue: number;
  purchases: number;
  roas: number;
  ads: { decision: Decision; roas: number; name: string }[];
}

function decisionForAd(roas: number): Decision {
  if (roas >= 2) return 'keep';
  if (roas >= 1) return 'refresh';
  return 'pause';
}

const COLORS: Record<Decision, { bg: string; border: string; label: string; chipBg: string; chipFg: string }> = {
  keep:    { bg: '#10b981', border: '#10b981', label: 'keep',    chipBg: 'rgba(16,185,129,0.12)',  chipFg: '#047857' },
  refresh: { bg: '#f59e0b', border: '#f59e0b', label: 'refresh', chipBg: 'rgba(245,158,11,0.12)',  chipFg: '#b45309' },
  pause:   { bg: '#ef4444', border: '#ef4444', label: 'pause',   chipBg: 'rgba(239,68,68,0.12)',   chipFg: '#b91c1c' },
};

export default function PerCampaignOptimization({ ads, currency, maxAdsPerCampaign = 5 }: Props) {
  // Agrupa por campanha (usa campaignName se disponível; senão account+id pra não juntar tudo)
  const byCampaign = new Map<string, CampaignSummary>();
  for (const ad of ads) {
    const cname = (ad as any).campaignName as string | undefined;
    if (!cname) continue;
    const key = `${ad.account}::${cname}`;
    const ex = byCampaign.get(key) ?? {
      name: cname, account: ad.account, spend: 0, revenue: 0, purchases: 0, roas: 0, ads: [],
    };
    ex.spend += ad.spend || 0;
    ex.revenue += ad.revenue || 0;
    ex.purchases += ad.purchases || 0;
    ex.ads.push({
      decision: decisionForAd(ad.roas || 0),
      roas: ad.roas || 0,
      name: ad.name,
    });
    byCampaign.set(key, ex);
  }

  const campaigns = Array.from(byCampaign.values())
    .map(c => ({ ...c, roas: c.spend > 0 ? c.revenue / c.spend : 0 }))
    .filter(c => c.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[18px]">📦</span>
        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
          Per-Campaign Optimization (max {maxAdsPerCampaign} ads/campaign)
        </h3>
      </div>
      <p className="text-[11px] mb-4" style={{ color: 'var(--ink-soft)' }}>
        Cada campanha pode ter até <strong>{maxAdsPerCampaign} criativos ativos</strong>. Abaixo: keep / refresh / pause / open slots por campanha.
      </p>
      {campaigns.length === 0 ? (
        <div className="text-[11px] py-4 text-center" style={{ color: 'var(--ink-muted)' }}>
          Nenhuma campanha com dados no período.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {campaigns.map((c) => {
            const sortedAds = [...c.ads].sort((a, b) => b.roas - a.roas).slice(0, maxAdsPerCampaign);
            const keep = sortedAds.filter(a => a.decision === 'keep').length;
            const refresh = sortedAds.filter(a => a.decision === 'refresh').length;
            const pause = sortedAds.filter(a => a.decision === 'pause').length;
            const openSlots = Math.max(0, maxAdsPerCampaign - sortedAds.length);

            return (
              <div
                key={`${c.account}::${c.name}`}
                className="rounded-lg p-3"
                style={{ border: '1px solid var(--border)', background: 'white' }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--ink)' }} title={c.name}>
                      {c.name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                      {formatCurrency(c.spend, currency, true)} · ROAS {formatDecimal(c.roas)}× · {formatNumber(c.purchases)} pur · {c.ads.length} ads
                    </div>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'rgba(99,102,241,0.12)', color: '#4338ca' }}>
                    {c.account}
                  </span>
                </div>

                {/* Slots visuais */}
                <div className="flex items-center gap-1 mb-2">
                  {sortedAds.map((ad, i) => {
                    const c = COLORS[ad.decision];
                    return (
                      <div
                        key={i}
                        title={`${ad.decision.toUpperCase()} — ROAS ${formatDecimal(ad.roas)}× — ${ad.name}`}
                        style={{
                          width: 22, height: 22, borderRadius: 4,
                          background: c.bg, border: `1px solid ${c.border}`,
                          flexShrink: 0,
                        }}
                      />
                    );
                  })}
                  {Array.from({ length: openSlots }).map((_, i) => (
                    <div
                      key={`open-${i}`}
                      title="OPEN — slot disponível"
                      style={{
                        width: 22, height: 22, borderRadius: 4,
                        background: 'transparent',
                        border: '1px dashed #cbd5e1',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>

                {/* Chips com contagens */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {keep > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: COLORS.keep.chipBg, color: COLORS.keep.chipFg }}>
                      {keep} keep
                    </span>
                  )}
                  {refresh > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: COLORS.refresh.chipBg, color: COLORS.refresh.chipFg }}>
                      {refresh} refresh
                    </span>
                  )}
                  {pause > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: COLORS.pause.chipBg, color: COLORS.pause.chipFg }}>
                      {pause} pause
                    </span>
                  )}
                  {openSlots > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.10)', color: '#4338ca' }}>
                      {openSlots} open slots
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[10px] italic mt-3" style={{ color: 'var(--ink-muted)' }}>
        Regras: ROAS ≥ 2× = <strong style={{ color: '#047857' }}>keep</strong> · 1× ≤ ROAS &lt; 2× = <strong style={{ color: '#b45309' }}>refresh</strong> · ROAS &lt; 1× = <strong style={{ color: '#b91c1c' }}>pause</strong>.
      </div>
    </div>
  );
}

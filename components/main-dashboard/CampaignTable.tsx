'use client';

import type { CampaignRow, Market } from '@/lib/main-dashboard/types';
import { fmtCurrency, fmtMultiple, fmtNumber } from '@/lib/main-dashboard/utils';

interface Props { campaigns: CampaignRow[]; market: Market; }

const STATUS_STYLE: Record<CampaignRow['status'], string> = {
  ATIVO: 'bg-green-100 text-green-700',
  REVISAR: 'bg-amber-100 text-amber-700',
  PAUSAR: 'bg-red-100 text-red-700',
  ESCALAR: 'bg-yellow-100 text-yellow-800',
  TRÁFEGO: 'bg-blue-100 text-blue-700',
  AWARENESS: 'bg-slate-100 text-slate-700',
  LEADS: 'bg-purple-100 text-purple-700',
  ENGAJAMENTO: 'bg-pink-100 text-pink-700',
};

const STATUS_ICON: Record<CampaignRow['status'], string> = {
  ATIVO: '✓',
  REVISAR: '⚠',
  PAUSAR: '✗',
  ESCALAR: '⭐',
  TRÁFEGO: '→',
  AWARENESS: '◐',
  LEADS: '•',
  ENGAJAMENTO: '♥',
};

export default function CampaignTable({ campaigns, market }: Props) {
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  return (
    <section className="card mt-4">
      <div className="p-5 border-b border-card-border">
        <div className="text-xs font-bold uppercase tracking-wider text-steel">
          Performance por campanha · {market} · Meta + Google Ads · Spend total {fmtCurrency(totalSpend, market, { compact: true })}
        </div>
        <div className="text-[11px] text-steel mt-1">Nível: Campanha · ROAS = purchase_conversion_value / spend</div>
      </div>
      <div className="overflow-x-auto thin-scroll">
        <table className="w-full text-xs">
          <thead className="bg-cloud sticky top-0">
            <tr className="text-left text-[10px] uppercase font-bold text-steel tracking-wide">
              <th className="px-4 py-2.5">Campanha</th>
              <th className="px-3 py-2.5">Plataforma</th>
              <th className="px-3 py-2.5 text-right">Spent</th>
              <th className="px-3 py-2.5 text-right">ROAS</th>
              <th className="px-3 py-2.5 text-right">Purch.</th>
              <th className="px-3 py-2.5 text-right">CPO</th>
              <th className="px-3 py-2.5 text-right">Add to Cart</th>
              <th className="px-3 py-2.5 text-right">Landing Page View</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-steel italic">Sem campanhas no período.</td></tr>
            )}
            {campaigns.map((c) => {
              const roasColor = c.roas == null ? 'text-steel' : c.roas >= 2 ? 'text-good' : c.roas >= 1 ? 'text-warn' : 'text-bad';
              const platformStyle = c.platform === 'Google' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
              return (
                <tr key={`${c.platform ?? 'Meta'}-${c.campaign}`} className="border-t border-card-border hover:bg-cloud/60">
                  <td className="px-4 py-2 font-medium text-ink max-w-[260px] truncate" title={c.campaign}>
                    {c.campaign}
                    {c.status === 'ESCALAR' && <span className="ml-1">⭐</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${platformStyle}`}>
                      {c.platform ?? 'Meta'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(c.spend, market)}</td>
                  <td className={`px-3 py-2 text-right font-bold ${roasColor}`}>{c.roas == null ? '—' : fmtMultiple(c.roas)}</td>
                  <td className="px-3 py-2 text-right">{c.purchases == null ? '—' : fmtNumber(c.purchases)}</td>
                  <td className="px-3 py-2 text-right">{c.cpo == null || !isFinite(c.cpo) ? '—' : fmtCurrency(c.cpo, market)}</td>
                  <td className="px-3 py-2 text-right">{c.atc == null ? '—' : fmtNumber(c.atc)}</td>
                  <td className="px-3 py-2 text-right">{c.lpv == null ? '—' : fmtNumber(c.lpv)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${STATUS_STYLE[c.status]}`}>
                      {STATUS_ICON[c.status]} {c.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

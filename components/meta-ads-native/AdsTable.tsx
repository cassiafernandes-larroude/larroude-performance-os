'use client';
import type { AdRow } from '@/lib/meta-ads-native/types';
import { formatCurrency, formatDecimal, formatNumber, formatPercent } from '@/lib/meta-ads-native/format';

export default function AdsTable({ data, currency = 'USD', title = 'Creative performance' }: { data: AdRow[]; currency?: string; title?: string }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-ink-600 bg-brand-50">
            <tr>
              <th className="text-left px-2 py-1.5">Ad name</th>
              <th className="text-left px-2 py-1.5">Account</th>
              <th className="text-right px-2 py-1.5">Spent</th>
              <th className="text-right px-2 py-1.5">CTR</th>
              <th className="text-right px-2 py-1.5">ATC</th>
              <th className="text-right px-2 py-1.5">Purchases</th>
              <th className="text-right px-2 py-1.5">Purch. Value</th>
              <th className="text-right px-2 py-1.5">Cost per Purch.</th>
              <th className="text-right px-2 py-1.5">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 20).map((r) => (
              <tr key={r.id} className="border-t border-ink-100 hover:bg-brand-50/40">
                <td className="px-2 py-1.5 max-w-[280px] truncate text-ink-800 font-medium" data-no-translate="true">{r.name}</td>
                <td className="px-2 py-1.5 text-ink-600">{r.account}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.spend, currency, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatPercent((r.ctr ?? 0), 2)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.addsToCart ?? 0)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.purchases)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.revenue, currency, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.costPerPurchase, currency, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-brand-700">{formatDecimal(r.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

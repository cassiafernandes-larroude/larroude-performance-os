'use client';
import type { CampaignRow } from '@/lib/meta-ads-native/types';
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/meta-ads-native/format';

export default function CampaignsTable({ data, currency = 'USD' }: { data: CampaignRow[]; currency?: string }) {
  const total = data.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      revenue: a.revenue + r.revenue,
      purchases: a.purchases + r.purchases,
    }),
    { spend: 0, revenue: 0, purchases: 0 }
  );
  const totalCpp = total.purchases > 0 ? total.spend / total.purchases : 0;
  const totalRoas = total.spend > 0 ? total.revenue / total.spend : 0;

  return (
    <div className="card">
      <div className="card-title">Top Campaigns</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-ink-600 bg-brand-50">
            <tr>
              <th className="text-left px-2 py-1.5">Campaign name</th>
              <th className="text-left px-2 py-1.5">Account name</th>
              <th className="text-right px-2 py-1.5">Spent</th>
              <th className="text-right px-2 py-1.5">Purchases Value</th>
              <th className="text-right px-2 py-1.5">Purchases</th>
              <th className="text-right px-2 py-1.5">ROAS</th>
              <th className="text-right px-2 py-1.5">Cost per Purchase</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((r) => (
              <tr key={r.id} className="border-t border-ink-100 hover:bg-brand-50/40">
                <td className="px-2 py-1.5 max-w-[280px] truncate text-ink-800 font-medium">{r.name}</td>
                <td className="px-2 py-1.5 text-ink-600">{r.account}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.spend, currency, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.revenue, currency, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.purchases)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(r.roas)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.costPerPurchase, currency, true)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-brand-300 bg-brand-50 font-semibold text-ink-800">
              <td className="px-2 py-1.5">Grand total</td>
              <td></td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(total.spend, currency, true)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(total.revenue, currency, true)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(total.purchases)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(totalRoas)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(totalCpp, currency, true)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

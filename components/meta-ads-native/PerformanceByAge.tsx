'use client';
import type { AgePerformanceRow } from '@/lib/meta-ads-native/types';
import { formatCurrency, formatNumber, formatPercent, formatDecimal } from '@/lib/meta-ads-native/format';

interface Props { data: AgePerformanceRow[]; currency?: string; }

export default function PerformanceByAge({ data, currency = 'USD' }: Props) {
  const total = data.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      cpm: 0, cpc: 0, ctr: 0,
      websiteConversions: a.websiteConversions + r.websiteConversions,
      websiteConversionValue: a.websiteConversionValue + r.websiteConversionValue,
    }),
    { spend: 0, impressions: 0, clicks: 0, cpm: 0, cpc: 0, ctr: 0, websiteConversions: 0, websiteConversionValue: 0 }
  );

  return (
    <div className="card">
      <div className="card-title">Performance by age group</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-ink-600 bg-brand-50">
            <tr>
              <th className="text-left px-2 py-1.5">#</th>
              <th className="text-left px-2 py-1.5">Age</th>
              <th className="text-right px-2 py-1.5">Spend</th>
              <th className="text-right px-2 py-1.5">Impressions</th>
              <th className="text-right px-2 py-1.5">Clicks</th>
              <th className="text-right px-2 py-1.5">CPM</th>
              <th className="text-right px-2 py-1.5">CPC</th>
              <th className="text-right px-2 py-1.5">CTR</th>
              <th className="text-right px-2 py-1.5">Conversions</th>
              <th className="text-right px-2 py-1.5">Conv. Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.age} className="border-t border-ink-100 hover:bg-brand-50/40">
                <td className="px-2 py-1.5 text-ink-500">{i + 1}.</td>
                <td className="px-2 py-1.5 font-medium text-ink-800">{r.age}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.spend, currency, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.impressions, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.clicks, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(r.cpm)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(r.cpc)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatPercent(r.ctr * 100, 2)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.websiteConversions, true)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.websiteConversionValue, currency, true)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-brand-300 bg-brand-50 font-semibold text-ink-800">
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5">Grand total</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(total.spend, currency, true)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(total.impressions, true)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(total.clicks, true)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">—</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(total.clicks ? total.spend / total.clicks : 0)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatPercent(total.impressions ? (total.clicks / total.impressions) * 100 : 0, 2)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(total.websiteConversions, true)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(total.websiteConversionValue, currency, true)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

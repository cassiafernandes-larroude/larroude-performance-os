'use client';
import { formatCurrency } from '@/lib/meta-ads-native/format';

interface Props {
  data: { region: string; spend: number }[];
  currency?: string;
  title?: string;
}

/** Simple horizontal bar list (no map dependency).
 *  For a real map, swap for `react-simple-maps` + topojson later. */
export default function RegionList({ data, currency = 'USD', title = 'Region by Amount spent' }: Props) {
  const max = Math.max(...data.map((d) => d.spend), 1);
  return (
    <div className="card h-full">
      <div className="card-title">{title}</div>
      <div className="space-y-1.5 max-h-[280px] overflow-auto pr-1">
        {data.slice(0, 14).map((r) => {
          const pct = (r.spend / max) * 100;
          return (
            <div key={r.region} className="flex items-center gap-3 text-xs">
              <div className="w-28 truncate text-ink-600">{r.region}</div>
              <div className="flex-1 h-2.5 bg-ink-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-400 to-brand-700" style={{ width: `${pct}%` }} />
              </div>
              <div className="w-20 text-right font-medium tabular-nums text-ink-700">
                {formatCurrency(r.spend, currency, true)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

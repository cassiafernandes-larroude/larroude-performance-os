'use client';
import { formatNumber } from '@/lib/meta-ads-native/format';

interface Props {
  landingPageViews: number;
  addsToCart: number;
  checkoutsInitiated: number;
  purchases: number;
}

export default function Funnel(props: Props) {
  const steps = [
    { label: 'Landing page views',        value: props.landingPageViews },
    { label: 'Website adds to cart',      value: props.addsToCart },
    { label: 'Website checkouts initiated', value: props.checkoutsInitiated },
    { label: 'Website purchases',         value: props.purchases },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="card">
      <div className="card-title">CONVERSION FUNNEL</div>
      <div className="space-y-2">
        {steps.map((s, i) => {
          const pct = (s.value / max) * 100;
          const opacity = 0.55 + (1 - i / steps.length) * 0.45;
          return (
            <div key={s.label}>
              <div className="flex justify-between text-xs text-ink-600 mb-1">
                <span>{s.label}</span>
                <span className="font-semibold tabular-nums text-ink-800">{formatNumber(s.value)}</span>
              </div>
              <div className="h-5 bg-stone-100 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${Math.max(pct, 8)}%`,
                    background: `linear-gradient(90deg, rgba(238,63,140,${opacity}) 0%, rgba(194,24,91,${opacity}) 100%)`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

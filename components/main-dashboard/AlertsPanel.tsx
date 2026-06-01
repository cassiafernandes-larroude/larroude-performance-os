'use client';

import type { DashboardAlert } from '@/lib/main-dashboard/types';

interface Props { alerts: DashboardAlert[]; }

const TONE_STYLE = {
  good: { bg: 'bg-green-50', border: 'border-l-good', icon: '✅', titleColor: 'text-green-800' },
  warn: { bg: 'bg-amber-50', border: 'border-l-warn', icon: '⚠️', titleColor: 'text-amber-800' },
  bad: { bg: 'bg-red-50', border: 'border-l-bad', icon: '🔴', titleColor: 'text-red-800' },
  info: { bg: 'bg-blue-50', border: 'border-l-accent', icon: 'ℹ️', titleColor: 'text-blue-800' },
};

export default function AlertsPanel({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <section className="mt-4">
      <div className="text-sm font-bold tracking-wide text-ink mb-3">⚡ ALERTAS & AÇÕES RECOMENDADAS</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {alerts.map((a, i) => {
          const s = TONE_STYLE[a.tone];
          return (
            <div key={i} className={`card p-4 border-l-4 ${s.border} ${s.bg}`}>
              <div className={`text-xs font-bold ${s.titleColor} flex items-start gap-2`}>
                <span>{s.icon}</span>
                <span>{a.title}</span>
              </div>
              <div className="text-xs text-steel mt-1.5">{a.body}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

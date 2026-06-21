'use client';
// Cassia 2026-06-21: sub-abas da aba Clientes. Usa sub-rotas (Link) em vez de estado para isolar
// o CSS — a sub-aba "LTV por Produto" carrega o CSS escopado do LTV só na sua própria rota, sem
// vazar para a visão Clientes 360 (que usa o design system lpos / .card global).

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/clientes', label: 'Clientes 360' },
  { href: '/clientes/ltv-produto', label: 'LTV por Produto' },
];

export default function ClientesTabs() {
  const pathname = usePathname();
  return (
    <div className="px-4 lg:px-8 pt-4">
      <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        {TABS.map((t) => {
          const active = t.href === '/clientes' ? pathname === '/clientes' : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="px-4 py-2 text-[13px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={{
                color: active ? 'var(--pink-deep)' : 'var(--ink-soft)',
                borderBottom: active ? '2px solid var(--pink-deep)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

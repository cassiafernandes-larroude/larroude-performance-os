'use client';
// Cassia 2026-06-15: Producao 2.0 internalizado no Performance OS.
// Versao 1 (atual): wrapper iframe ao dashboard original com header padronizado.
// Versao 2 (proxima): componente nativo consumindo /api/producao/* (shape do upstream
// precisa ser inspecionado primeiro pra evitar client-side exception).

import { useState } from 'react';

const UPSTREAM_URL = 'https://larroude-producao-dashboard.vercel.app';

export default function ProducaoDashboard() {
  const [loadKey, setLoadKey] = useState(0);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header padronizado com os demais dashboards */}
      <header className="mb-4">
        <div className="pt-2 pb-2 flex items-start justify-between gap-4 flex-wrap">
          <h1
            className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
          >
            Produção 2.0
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLoadKey(k => k + 1)}
              className="pill pill-ghost px-3 py-1.5 text-[12px]"
              title="Recarregar"
            >
              ↻ Atualizar
            </button>
            <a
              href={UPSTREAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="pill pill-ghost px-3 py-1.5 text-[12px]"
              title="Abrir em nova aba"
            >
              ↗ Abrir em nova aba
            </a>
          </div>
        </div>
        <p className="text-[13px] mt-2" style={{ color: 'var(--ink-soft)' }}>
          Parque produtivo TOC · <b>LARROUDE FILIAL SAPIRANGA 4 - 1</b> (Senda 4)
          {' · '}
          5 abas: Produção · Remessas · Open Orders · Demanda · Diagnóstico
        </p>
      </header>

      {/* Iframe wrapper */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          height: 'calc(100vh - 220px)',
          minHeight: 600,
        }}
      >
        <iframe
          key={loadKey}
          src={UPSTREAM_URL}
          title="Produção 2.0"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          loading="lazy"
        />
      </div>
    </div>
  );
}

'use client';
// Cassia 2026-07-02: Cohort Analysis nativa — matriz de retenção por safra de aquisição
// (mês da 1ª compra), M0..M11. Mesmo design system do LTV/Clientes (.ltv-root + Header +
// .card-section). Consome /api/cohorts/[market] (getCohorts — trocas excluídas). Nunca
// exibe dado inventado: em falha mostra aviso, não estimativa.

import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/ltv-dashboard/Header';
import type { Market } from '@/lib/ltv-dashboard/queries';

interface CohortRow { cohort: string; size: number; offsets: number[] }
interface Bundle { available: boolean; market: Market; cohorts: CohortRow[]; error?: string }

const MAX_OFFSETS = 12; // M0..M11

function monthLabel(cohort: string): string {
  const [y, m] = cohort.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
}

// Heatmap verde (retenção alta) → vermelho (baixa), normalizado pelo teto observado
// nos offsets ≥1 (M0 é sempre 100% e fica fora da escala).
function cellColor(pct: number, scaleMax: number): { background: string; color: string } {
  const ratio = Math.max(0, Math.min(1, scaleMax > 0 ? pct / scaleMax : 0));
  const hue = ratio * 130; // 0 = vermelho, 130 = verde
  return {
    background: `hsla(${hue}, 62%, 46%, ${0.14 + ratio * 0.5})`,
    color: '#1f2937',
  };
}

export default function CohortDashboard({ freshness }: { freshness: string }) {
  const [market, setMarket] = useState<Market>('US');
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null); setData(null);
    fetch(`/api/cohorts/${market}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Bundle) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [market]);

  const cohorts = useMemo(() => (data?.cohorts ?? []).slice(-12), [data]);

  // Teto da escala de cor: maior retenção observada em M1+ (mínimo 5% pra não saturar tudo).
  const scaleMax = useMemo(() => {
    let max = 0;
    for (const c of cohorts) for (let k = 1; k < Math.min(c.offsets.length, MAX_OFFSETS); k++) {
      if (c.offsets[k] > max) max = c.offsets[k];
    }
    return Math.max(5, max);
  }, [cohorts]);

  const avgByOffset = useMemo(() => {
    const sums: number[] = Array(MAX_OFFSETS).fill(0);
    const counts: number[] = Array(MAX_OFFSETS).fill(0);
    for (const c of cohorts) {
      for (let k = 0; k < Math.min(c.offsets.length, MAX_OFFSETS); k++) {
        sums[k] += c.offsets[k];
        counts[k] += 1;
      }
    }
    return sums.map((s, k) => (counts[k] > 0 ? s / counts[k] : null));
  }, [cohorts]);

  const totalCustomers = useMemo(() => cohorts.reduce((s, c) => s + c.size, 0), [cohorts]);

  return (
    <main className="page">
      <div className="container">
        <Header
          market={market}
          onMarketChange={setMarket}
          freshness={freshness}
          title="Larroudé · Cohort Analysis"
          subtitle={<>Retenção por safra de aquisição (mês da 1ª compra) · últimos 12 meses · DTC · trocas excluídas · Shopify via BigQuery</>}
        />

        {loading && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <span className="spinner" />Carregando coortes…
          </div>
        )}
        {err && (
          <div className="card" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}>
            <strong>Erro:</strong> {err}
          </div>
        )}
        {data && !data.available && !loading && (
          <div className="card" style={{ borderColor: '#b3382f', background: '#fff5f5', color: '#b3382f' }}>
            <strong>Dados indisponíveis.</strong> A fonte (BigQuery) não respondeu — nada foi exibido nem estimado.
          </div>
        )}

        {data && data.available && cohorts.length > 0 && (
          <>
            <div className="section-label"><span>{'\u{1F4CA}'}</span><span>Retenção por mês desde a 1ª compra · {market === 'US' ? 'United States' : 'Brazil'}</span></div>
            <div className="card-section" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 2, fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>Coorte</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', color: '#6b7280', fontWeight: 600 }}>Clientes</th>
                    {Array.from({ length: MAX_OFFSETS }, (_, k) => (
                      <th key={k} style={{ textAlign: 'center', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>M{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.cohort}>
                      <td style={{ padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap', color: '#111827' }}>{monthLabel(c.cohort)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {c.size.toLocaleString('pt-BR')}
                      </td>
                      {Array.from({ length: MAX_OFFSETS }, (_, k) => {
                        // Célula futura (offset além do que a coorte já viveu) fica em branco.
                        if (k >= c.offsets.length) {
                          return <td key={k} style={{ padding: '6px 8px', background: '#f9fafb', borderRadius: 4 }} />;
                        }
                        const pct = c.offsets[k];
                        const style = k === 0
                          ? { background: 'rgba(93, 78, 197, 0.12)', color: '#374151' }
                          : cellColor(pct, scaleMax);
                        return (
                          <td
                            key={k}
                            title={`${monthLabel(c.cohort)} · M${k}: ${pct.toFixed(1)}% da coorte voltou a comprar`}
                            style={{ padding: '6px 8px', textAlign: 'center', borderRadius: 4, fontVariantNumeric: 'tabular-nums', fontWeight: k === 0 ? 600 : 500, ...style }}
                          >
                            {k === 0 ? '100%' : `${pct.toFixed(1)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#111827', borderTop: '1px solid #e5e7eb' }}>Média</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderTop: '1px solid #e5e7eb', fontVariantNumeric: 'tabular-nums' }}>
                      {totalCustomers.toLocaleString('pt-BR')}
                    </td>
                    {avgByOffset.map((v, k) => (
                      <td key={k} style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 600, color: '#374151', borderTop: '1px solid #e5e7eb', fontVariantNumeric: 'tabular-nums' }}>
                        {v == null ? '' : k === 0 ? '100%' : `${v.toFixed(1)}%`}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
                Cada linha é uma safra (mês da 1ª compra). M<i>k</i> = % da safra que voltou a comprar <i>k</i> meses após a aquisição
                (M0 = 100% por definição). Verde = retenção alta · vermelho = baixa. Células em branco = meses ainda não vividos pela safra.
              </div>
            </div>
          </>
        )}

        {data && data.available && cohorts.length === 0 && !loading && (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Sem coortes no período.
          </div>
        )}
      </div>
    </main>
  );
}

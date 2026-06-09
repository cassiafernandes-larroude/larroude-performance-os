'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CustomerJourney, JourneyProduct, Market, TransitionCell } from '@/lib/ltv-dashboard/queries';
import { formatNumber, formatPercent } from '@/lib/ltv-dashboard/format';
import KpiCard from './KpiCard';

function ProductList({
  title,
  badge,
  badgeColor,
  products,
  market,
  showRepeatRate,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  products: JourneyProduct[];
  market: Market;
  showRepeatRate?: boolean;
}) {
  if (!products.length) {
    return <div className="empty">Sem dados.</div>;
  }
  const maxC = Math.max(...products.map((p) => p.customers), 1);
  return (
    <div className="card-section">
      <div className="section-head">
        <span className="section-badge" style={{ background: badgeColor, color: '#fff' }}>
          {badge}
        </span>
        <h3>{title}</h3>
      </div>
      <div className="table-scroll">
        <table className="prod-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Produto</th>
              <th className="num">Clientes</th>
              {showRepeatRate && <th className="num">Taxa Repeat</th>}
              <th className="num">Dias mediano</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.motherSku}>
                <td className="rank-cell">{i + 1}</td>
                <td className="name-cell">
                  <div className="prod-name">{p.productName}</div>
                  <div className="prod-sku">{p.motherSku}</div>
                </td>
                <td className="num">
                  <div className="bar-cell">
                    <div className="mini-bar">
                      <div
                        className="mini-bar-fill"
                        style={{
                          width: `${(p.customers / maxC) * 100}%`,
                          background: badgeColor,
                        }}
                      />
                    </div>
                    <span>{formatNumber(p.customers, market)}</span>
                  </div>
                </td>
                {showRepeatRate && (
                  <td className="num ltv-cell">
                    {p.repeatRate !== undefined ? formatPercent(p.repeatRate, 1) : '—'}
                  </td>
                )}
                <td className="num">
                  {p.medianDaysFromPrev && p.medianDaysFromPrev > 0
                    ? `${p.medianDaysFromPrev} d`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransitionMatrix({
  cells,
  market,
}: {
  cells: TransitionCell[];
  market: Market;
}) {
  // Build pivot: rows = fromSku, cols = toSku
  const fromKeys = Array.from(new Set(cells.map((c) => c.fromSku)));
  const toKeys = Array.from(new Set(cells.map((c) => c.toSku)));
  const fromNames = new Map(cells.map((c) => [c.fromSku, c.fromName]));
  const toNames = new Map(cells.map((c) => [c.toSku, c.toName]));
  const cellMap = new Map<string, TransitionCell>();
  for (const c of cells) cellMap.set(`${c.fromSku}|${c.toSku}`, c);

  // Cor por % de transição: verde forte = alto, cinza = baixo
  function colorFor(pct: number): string {
    if (pct >= 30) return '#2c7a5b';
    if (pct >= 15) return '#5fa384';
    if (pct >= 7) return '#a8c8b8';
    if (pct >= 1) return '#dde9e1';
    return '#f0ece5';
  }

  if (!cells.length) {
    return <div className="empty">Sem dados de transição.</div>;
  }

  return (
    <div className="card-section">
      <div className="section-head">
        <span
          className="section-badge"
          style={{ background: '#5d4ec5', color: '#fff' }}
        >
          D · TRANSIÇÃO 1ª → 2ª
        </span>
        <h3>Quem compra X, leva o quê depois</h3>
        <span className="section-meta">
          Top 15 produtos da 1ª compra × Top 15 destinos na 2ª · % dos clientes (linha) que escolheram cada produto (coluna)
        </span>
      </div>
      <div className="hm-scroll">
        <table className="hm-table" style={{ minWidth: 2200 }}>
          <thead>
            <tr>
              <th className="hm-col-name" style={{ textAlign: 'left' }}>
                1ª compra ↓ \ 2ª →
              </th>
              {toKeys.map((to) => (
                <th
                  key={to}
                  className="hm-col-day"
                  style={{ minWidth: 140, fontSize: 10.5, padding: '8px 6px', lineHeight: 1.2 }}
                  title={toNames.get(to)}
                >
                  {toNames.get(to) ?? to}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fromKeys.map((from) => (
              <tr key={from}>
                <td className="hm-name" style={{ fontWeight: 600 }} title={fromNames.get(from)}>
                  {fromNames.get(from)}
                </td>
                {toKeys.map((to) => {
                  const c = cellMap.get(`${from}|${to}`);
                  if (!c) {
                    return (
                      <td
                        key={to}
                        className="hm-cell"
                        style={{ background: '#f0ece5', color: '#8a8a8a' }}
                      >
                        ·
                      </td>
                    );
                  }
                  const bg = colorFor(c.pctOfFirst);
                  const fg = c.pctOfFirst >= 15 ? '#fff' : '#1a1a1a';
                  return (
                    <td
                      key={to}
                      className="hm-cell"
                      style={{
                        background: bg,
                        color: fg,
                        minWidth: 90,
                        height: 38,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                      title={`${formatNumber(c.customers, market)} clientes · ${c.pctOfFirst.toFixed(1)}%`}
                    >
                      <div>{c.pctOfFirst.toFixed(1)}%</div>
                      <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>
                        {formatNumber(c.customers, market)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RecState = {
  accepted: Set<string>;
  ignored: Set<string>;
  applied: Set<string>;
};

function storageKey(market: Market) {
  return `larroude-ltv-media-rec-${market}`;
}

function loadRecState(market: Market): RecState {
  if (typeof window === 'undefined') {
    return { accepted: new Set(), ignored: new Set(), applied: new Set() };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(market));
    if (!raw) return { accepted: new Set(), ignored: new Set(), applied: new Set() };
    const obj = JSON.parse(raw);
    return {
      accepted: new Set<string>(obj.accepted ?? []),
      ignored: new Set<string>(obj.ignored ?? []),
      applied: new Set<string>(obj.applied ?? []),
    };
  } catch {
    return { accepted: new Set(), ignored: new Set(), applied: new Set() };
  }
}

function saveRecState(market: Market, state: RecState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    storageKey(market),
    JSON.stringify({
      accepted: Array.from(state.accepted),
      ignored: Array.from(state.ignored),
      applied: Array.from(state.applied),
    }),
  );
}

function MediaRecommendations({
  transitions,
  market,
}: {
  transitions: TransitionCell[];
  market: Market;
}) {
  // Estado por mercado: accepted / ignored / applied (persistido em localStorage)
  const [recState, setRecState] = useState<RecState>(() => loadRecState(market));

  // Re-load quando trocar de mercado
  useEffect(() => {
    setRecState(loadRecState(market));
  }, [market]);

  // Top 12 recomendações ranqueadas por volume + % (impacto-ponderado).
  // Critérios: ≥15 clientes, ≥4% recompra, produto destino diferente do origem.
  const top = useMemo(() => {
    return transitions
      .filter(
        (t) =>
          t.customers >= 15 &&
          t.pctOfFirst >= 4 &&
          t.fromName !== t.toName,
      )
      .map((t) => ({
        ...t,
        score: t.customers * Math.sqrt(t.pctOfFirst),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [transitions]);

  // Filtra cards ignorados
  const visible = useMemo(() => {
    return top.filter((t) => !recState.ignored.has(`${t.fromSku}|${t.toSku}`));
  }, [top, recState.ignored]);

  function update(fn: (s: RecState) => RecState) {
    setRecState((prev) => {
      const next = fn(prev);
      saveRecState(market, next);
      return next;
    });
  }

  function accept(id: string) {
    update((s) => {
      const accepted = new Set(s.accepted);
      const ignored = new Set(s.ignored);
      accepted.add(id);
      ignored.delete(id);
      return { ...s, accepted, ignored };
    });
  }

  function ignore(id: string) {
    update((s) => {
      const ignored = new Set(s.ignored);
      const accepted = new Set(s.accepted);
      const applied = new Set(s.applied);
      ignored.add(id);
      accepted.delete(id);
      applied.delete(id);
      return { accepted, ignored, applied };
    });
  }

  function toggleApplied(id: string) {
    update((s) => {
      const applied = new Set(s.applied);
      if (applied.has(id)) applied.delete(id);
      else applied.add(id);
      return { ...s, applied };
    });
  }

  function resetIgnored() {
    update((s) => ({ ...s, ignored: new Set() }));
  }

  function resetAll() {
    if (typeof window === 'undefined') return;
    const total =
      recState.accepted.size + recState.ignored.size + recState.applied.size;
    if (total === 0) return;
    const confirmed = window.confirm(
      `Resetar todas as ${total} marcações (aceitas, ignoradas e aplicadas) para esse mercado?`,
    );
    if (!confirmed) return;
    update(() => ({ accepted: new Set(), ignored: new Set(), applied: new Set() }));
  }

  if (!top.length) {
    return null;
  }

  const acceptedCount = recState.accepted.size;
  const appliedCount = recState.applied.size;
  const ignoredCount = recState.ignored.size;

  const hasAnyState = acceptedCount > 0 || appliedCount > 0 || ignoredCount > 0;

  return (
    <div className="card-section">
      <div className="section-head">
        <span className="section-badge" style={{ background: '#c47a2a', color: '#fff' }}>
          F · RECOMENDAÇÕES
        </span>
        <h3>Comunicações de mídia · ações sugeridas</h3>
        <span className="section-meta">
          Flows automáticos com base nas transições reais
          {hasAnyState && (
            <>
              {' · '}
              <span style={{ color: '#2c7a5b', fontWeight: 600 }}>
                {acceptedCount} aceitas
              </span>
              {appliedCount > 0 && (
                <>
                  {' · '}
                  <span style={{ color: '#5d4ec5', fontWeight: 600 }}>
                    {appliedCount} aplicadas
                  </span>
                </>
              )}
              {ignoredCount > 0 && (
                <>
                  {' · '}
                  <button
                    onClick={resetIgnored}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#c44a4a',
                      fontStyle: 'italic',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: 0,
                    }}
                  >
                    {ignoredCount} ignorada{ignoredCount !== 1 ? 's' : ''} (restaurar)
                  </button>
                </>
              )}
            </>
          )}
        </span>
        {hasAnyState && (
          <button
            onClick={resetAll}
            title="Resetar todas as marcações (aceitas, ignoradas e aplicadas)"
            style={{
              background: '#fff',
              border: '1px solid #c47a2a',
              color: '#c47a2a',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginLeft: 8,
            }}
          >
            <span style={{ fontSize: 14 }}>↻</span> Resetar tudo
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 14,
          alignItems: 'stretch',
        }}
      >
        {visible.map((rec, i) => {
          const id = `${rec.fromSku}|${rec.toSku}`;
          const isAccepted = recState.accepted.has(id);
          const isApplied = recState.applied.has(id);
          const days = rec.medianDaysFromPrev ?? 30;
          const triggerStart = Math.max(3, Math.round(days * 0.4));
          const triggerEnd = Math.max(triggerStart + 7, Math.round(days * 0.9));
          const secondaryChannel = market === 'BR' ? 'WhatsApp' : 'SMS';
          const channelName = `Flow E-mail + ${secondaryChannel}`;
          const channel =
            days <= 21
              ? { name: channelName, color: '#d44a8a', icon: '⚡', urgency: 'alta' }
              : days <= 45
                ? { name: channelName, color: '#5d4ec5', icon: '📩', urgency: 'média' }
                : { name: channelName, color: '#2c7a5b', icon: '🎯', urgency: 'longa' };

          // Visual de selecionado (aceito)
          const cardBg = isApplied
            ? '#e8f4ec'
            : isAccepted
              ? '#f0f7e8'
              : '#fff8ec';
          const cardBorder = isApplied
            ? '#2c7a5b'
            : isAccepted
              ? '#5d8e3a'
              : '#ead8b7';
          const cardBorderWidth = isAccepted || isApplied ? 2 : 1;

          return (
            <div
              key={`${rec.fromSku}-${rec.toSku}-${i}`}
              style={{
                padding: '14px 16px',
                border: `${cardBorderWidth}px solid ${cardBorder}`,
                borderRadius: 10,
                background: cardBg,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                minHeight: 200,
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: '#8a5414',
                }}
              >
                <span>Flow #{i + 1}</span>
                <span
                  style={{
                    color: '#fff',
                    background: channel.color,
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 10,
                  }}
                >
                  {channel.icon} {channel.name}
                </span>
              </div>

              {/* From → To */}
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#3a2a1c' }}>
                <div>
                  <span style={{ color: '#8a8580' }}>Quem comprou:</span>{' '}
                  <strong>{rec.fromName}</strong>
                </div>
                <div>
                  <span style={{ color: '#8a8580' }}>Oferecer:</span>{' '}
                  <strong style={{ color: channel.color }}>{rec.toName}</strong>
                </div>
              </div>

              {/* Métricas */}
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  fontSize: 11.5,
                  color: '#5a4530',
                  paddingTop: 8,
                  borderTop: '1px dashed #e0d2b2',
                }}
              >
                <div>
                  <div style={{ color: '#8a8580', fontSize: 10 }}>AUDIÊNCIA</div>
                  <div style={{ fontWeight: 600 }}>
                    {formatNumber(rec.customers, market)} ({rec.pctOfFirst.toFixed(1)}%)
                  </div>
                </div>
                <div>
                  <div style={{ color: '#8a8580', fontSize: 10 }}>TIMING</div>
                  <div style={{ fontWeight: 600 }}>
                    D+{triggerStart}-{triggerEnd}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#8a8580', fontSize: 10 }}>MEDIANA</div>
                  <div style={{ fontWeight: 600 }}>{days} d</div>
                </div>
              </div>

              {/* Ação */}
              <div
                style={{
                  marginTop: 'auto',
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: '#3a2a1c',
                  background: '#fdedd0',
                  padding: '8px 12px',
                  borderRadius: 8,
                }}
              >
                <strong>Ação:</strong>{' '}
                {days <= 21 ? (
                  <>
                    Janela curta (urgência alta) — disparar e-mail D+{triggerStart} +{' '}
                    {secondaryChannel} D+{Math.round(days * 0.6)} oferecendo{' '}
                    <em>{rec.toName}</em>.
                  </>
                ) : days <= 45 ? (
                  <>
                    Janela média — flow E-mail D+{triggerStart} + reforço{' '}
                    {secondaryChannel} D+{Math.round(days * 0.7)} com{' '}
                    <em>{rec.toName}</em>.
                  </>
                ) : (
                  <>
                    Janela longa — flow E-mail sequencial (D+{triggerStart}, D+
                    {Math.round(days * 0.7)}) + {secondaryChannel} D+
                    {Math.round(days * 0.9)} com <em>{rec.toName}</em>.
                  </>
                )}
              </div>

              {/* Controles: Aceitar / Ignorar / Aplicado */}
              {isAccepted ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    paddingTop: 8,
                    borderTop: '1px dashed #c8d4b8',
                  }}
                >
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: isApplied ? '#1f5b3f' : '#5a4530',
                      cursor: 'pointer',
                      fontWeight: isApplied ? 600 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isApplied}
                      onChange={() => toggleApplied(id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2c7a5b' }}
                    />
                    {isApplied ? '✓ Aplicada' : 'Marcar como aplicada'}
                  </label>
                  <button
                    onClick={() => ignore(id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #d4a0a0',
                      color: '#a04444',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    title="Remover esta recomendação"
                  >
                    Ignorar
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    paddingTop: 8,
                    borderTop: '1px dashed #e0d2b2',
                  }}
                >
                  <button
                    onClick={() => accept(id)}
                    style={{
                      flex: 1,
                      background: '#2c7a5b',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Aceitar
                  </button>
                  <button
                    onClick={() => ignore(id)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      color: '#8a5414',
                      border: '1px solid #c4a070',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ✕ Ignorar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NextPurchaseExplorer({
  transitions,
  market,
}: {
  transitions: TransitionCell[];
  market: Market;
}) {
  // Lista única de produtos "from" com totais ordenados
  const fromOptions = useMemo(() => {
    const byFrom = new Map<string, { name: string; total: number }>();
    for (const t of transitions) {
      const cur = byFrom.get(t.fromSku);
      const total = (cur?.total ?? 0) + t.customers;
      byFrom.set(t.fromSku, { name: t.fromName, total });
    }
    return Array.from(byFrom.entries())
      .map(([sku, v]) => ({ sku, name: v.name, total: v.total }))
      .sort((a, b) => b.total - a.total);
  }, [transitions]);

  const [selected, setSelected] = useState<string>(() => fromOptions[0]?.sku ?? '');

  const destinations = useMemo(() => {
    return transitions
      .filter(t => t.fromSku === selected)
      .sort((a, b) => b.customers - a.customers)
      .slice(0, 10);
  }, [transitions, selected]);

  const selectedFrom = fromOptions.find(o => o.sku === selected);
  const maxC = Math.max(...destinations.map(d => d.customers), 1);

  if (!transitions.length) {
    return <div className="empty">Sem dados.</div>;
  }

  return (
    <div className="card-section">
      <div className="section-head">
        <span className="section-badge" style={{ background: '#1f6f8b', color: '#fff' }}>
          E · EXPLORADOR
        </span>
        <h3>O que vem depois de…?</h3>
        <span className="section-meta">
          Selecione um produto da 1ª compra para ver os destinos mais comuns na 2ª
        </span>
      </div>

      <div style={{ padding: '12px 0 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>1ª compra:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #d4cfc4',
            borderRadius: 8,
            background: '#fff',
            minWidth: 380,
            fontFamily: 'inherit',
          }}
        >
          {fromOptions.map(o => (
            <option key={o.sku} value={o.sku}>
              {o.name} · {formatNumber(o.total, market)} clientes
            </option>
          ))}
        </select>
        {selectedFrom && (
          <span style={{ fontSize: 12, color: '#888' }}>
            Total: {formatNumber(selectedFrom.total, market)} clientes que fizeram 2ª compra após este produto
          </span>
        )}
      </div>

      {destinations.length === 0 ? (
        <div className="empty">Sem destinos com volume mínimo para este produto.</div>
      ) : (
        <div className="table-scroll">
          <table className="prod-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Produto da 2ª compra</th>
                <th className="num">Clientes</th>
                <th className="num">% dos que fizeram 2ª</th>
                <th className="num">Dias mediano</th>
              </tr>
            </thead>
            <tbody>
              {destinations.map((d, i) => (
                <tr key={d.toSku}>
                  <td className="rank-cell">{i + 1}</td>
                  <td className="name-cell">
                    <div className="prod-name">{d.toName}</div>
                  </td>
                  <td className="num">
                    <div className="bar-cell">
                      <div className="mini-bar">
                        <div
                          className="mini-bar-fill"
                          style={{
                            width: `${(d.customers / maxC) * 100}%`,
                            background: '#1f6f8b',
                          }}
                        />
                      </div>
                      <span>{formatNumber(d.customers, market)}</span>
                    </div>
                  </td>
                  <td className="num ltv-cell">{formatPercent(d.pctOfFirst, 1)}</td>
                  <td className="num">
                    {d.medianDaysFromPrev && d.medianDaysFromPrev > 0
                      ? `${d.medianDaysFromPrev} d`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CustomerJourneyBlock({
  journey,
  market,
  loading,
}: {
  journey: CustomerJourney | null;
  market: Market;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <span className="spinner" />
        Carregando jornada do cliente...
      </div>
    );
  }
  if (!journey) return null;

  return (
    <>
      {/* KPIs tempo entre compras */}
      <div className="kpi-grid">
        <KpiCard
          label="Tempo 1ª → 2ª compra"
          value={journey.medianDays1to2 > 0 ? `${journey.medianDays1to2} d` : '—'}
          sub="Mediana de dias entre 1ª e 2ª compra"
          highlight
        />
        <KpiCard
          label="Tempo 2ª → 3ª compra"
          value={journey.medianDays2to3 > 0 ? `${journey.medianDays2to3} d` : '—'}
          sub="Mediana de dias entre 2ª e 3ª compra"
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <ProductList
          title="Top 5 Produtos de Entrada (1ª compra)"
          badge="A · ENTRADA"
          badgeColor="#2c7a5b"
          products={journey.entryProducts}
          market={market}
          showRepeatRate
        />
      </div>

      <div className="charts-grid two-col" style={{ marginTop: 16 }}>
        <ProductList
          title="Top 5 da 2ª compra"
          badge="B · 2ª COMPRA"
          badgeColor="#d44a8a"
          products={journey.secondPurchaseProducts}
          market={market}
        />
        <ProductList
          title="Top 5 da 3ª compra"
          badge="C · 3ª COMPRA"
          badgeColor="#d97757"
          products={journey.thirdPurchaseProducts}
          market={market}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <TransitionMatrix cells={journey.transitionMatrix} market={market} />
      </div>

      <div style={{ marginTop: 16 }}>
        <NextPurchaseExplorer transitions={journey.allTransitions} market={market} />
      </div>

      <div style={{ marginTop: 16 }}>
        <MediaRecommendations transitions={journey.allTransitions} market={market} />
      </div>
    </>
  );
}

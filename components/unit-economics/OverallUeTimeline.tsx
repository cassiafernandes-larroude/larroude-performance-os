'use client';
// Cassia 2026-06-26: Unit Economics GERAL (todos os SKUs agregados) ao longo do tempo.
// Mesma metodologia do gráfico por SKU (ProductUeTimeline): preço/desconto/tax/duties/unidades
// reais por bucket (todos os produtos somados) + COGS/retorno/pix/marketing como snapshot BLENDED
// (média ponderada por unidade dos produtos do período). MCL/un = margem de contribuição líquida
// média por unidade do mercado inteiro.

import { useEffect, useMemo, useState } from 'react';
import BarLineChart, { type BarPoint } from '@/components/shared/BarLineChart';
import { computeCascade, type Assumptions } from '@/lib/unit-economics/cascade';
import type { ProductUnitEconomics, Market } from '@/lib/unit-economics/queries';
import type { Period } from '@/types/metric';

interface Bucket { date: string; units: number; grossRevenue: number; discount: number; tax: number; duties: number }

interface Props {
  market: Market;
  products: ProductUnitEconomics[];
  returnRate30d: number;
  exchangeRate30d: number;
  marketingPerUnit: number;
  assumptions: Assumptions;
  currency: 'USD' | 'BRL';
}

const PRESETS: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' }, { key: '14d', label: '14D' }, { key: '28d', label: '28D' },
  { key: '3M', label: '3M' }, { key: '6M', label: '6M' }, { key: '12M', label: '12M' },
];

export default function OverallUeTimeline({ market, products, returnRate30d, exchangeRate30d, marketingPerUnit, assumptions, currency }: Props) {
  const [period, setPeriod] = useState<Period>('28d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [applied, setApplied] = useState<{ start: string; end: string } | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeLabel, setRangeLabel] = useState<string>('');

  // Snapshots BLENDED (média ponderada por unidade) dos produtos do período.
  const blended = useMemo(() => {
    let units = 0, cogs = 0, pix = 0, todayPrice = 0;
    for (const p of products) {
      const u = p.totalUnits || 0;
      units += u;
      cogs += (p.unitCogs || 0) * u;
      pix += (p.pixShare || 0) * u;
      todayPrice += (p.unitGrossRevenue || 0) * u; // unitGrossRevenue = listPrice atual (catálogo)
    }
    return {
      unitCogs: units > 0 ? cogs / units : 0,
      pixShare: units > 0 ? pix / units : 0,
      todayPrice: units > 0 ? todayPrice / units : 0, // preço de hoje blended (ponderado por unidade)
    };
  }, [products]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (applied) { params.set('start', applied.start); params.set('end', applied.end); }
    else { params.set('period', period); }
    fetch(`/api/unit-economics/${market}/timeseries-overall?${params}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: { buckets: Bucket[]; start: string; end: string }) => {
        if (cancelled) return;
        setBuckets(json.buckets || []);
        setRangeLabel(`${json.start} → ${json.end}`);
        setLoading(false);
      })
      .catch((err: Error) => { if (cancelled) return; setError(err.message); setLoading(false); });
    return () => { cancelled = true; };
  }, [market, period, applied]);

  const points: BarPoint[] = useMemo(() => {
    return buckets
      .filter((b) => b.units > 0)
      .map((b) => {
        const grossSoldPerUnit = b.grossRevenue / b.units;             // preço bruto real do período
        const netSoldPerUnit = (b.grossRevenue - b.discount) / b.units; // valor efetivamente vendido/un
        // Base = preço de hoje blended; desconto = markdown até o valor vendido no período (igual à cascata).
        const markdownPerUnit = Math.max(0, blended.todayPrice - netSoldPerUnit);
        const bucketProduct: ProductUnitEconomics = {
          motherSku: '__ALL__', variantSku: null, productName: 'Geral',
          totalUnits: b.units, totalOrders: 0,
          unitGrossRevenue: blended.todayPrice,
          unitDiscount: markdownPerUnit,
          unitTax: b.tax / b.units,
          unitDuties: b.duties / b.units,
          unitCogs: blended.unitCogs,
          unitRefund: grossSoldPerUnit * (returnRate30d || 0),
          exchangeRate: exchangeRate30d || 0,
          returnRate30d: returnRate30d || 0,
          pixShare: blended.pixShare,
          currency,
        };
        const c = computeCascade(bucketProduct, assumptions, market, marketingPerUnit);
        return {
          date: b.date,
          value: Number(c.netCmReal.toFixed(2)),
          color: c.netCmReal >= 0 ? '#16A34A' : '#DC2626',
        } as BarPoint;
      });
  }, [buckets, blended, returnRate30d, exchangeRate30d, assumptions, market, marketingPerUnit, currency]);

  function applyCustom() {
    if (/^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
      setApplied({ start: customStart, end: customEnd });
    }
  }

  return (
    <div className="card p-5 mt-4">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-steel">
          Unit Economics GERAL ao longo do tempo · todos os SKUs
        </div>
        {rangeLabel && <div className="text-[11px] italic" style={{ color: '#9ca3af' }}>{rangeLabel}</div>}
      </div>

      <div
        className="no-print"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          background: '#fff', border: '1px solid #e5e3de', borderRadius: 16,
          padding: '10px 14px', marginTop: 8, marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, color: '#9ca3af' }}>PERIOD</span>
        {PRESETS.map((p) => {
          const active = !applied && period === p.key;
          return (
            <button
              key={p.key}
              onClick={() => { setApplied(null); setPeriod(p.key); }}
              style={{
                padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: active ? '#1a1a1a' : '#ebe9e3', color: active ? '#fff' : '#1a1a1a',
              }}
            >
              {p.label}
            </button>
          );
        })}
        <span style={{ width: 1, height: 22, background: '#e5e3de', margin: '0 2px' }} />
        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
          style={{ borderRadius: 999, border: '1px solid #e5e3de', padding: '6px 12px', fontSize: 13, background: '#fff' }} />
        <span style={{ fontSize: 13, color: '#6b7280' }}>to</span>
        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
          style={{ borderRadius: 999, border: '1px solid #e5e3de', padding: '6px 12px', fontSize: 13, background: '#fff' }} />
        <button onClick={applyCustom}
          style={{ padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#1a1a1a', color: '#fff' }}>
          Apply
        </button>
      </div>

      {error && <div className="text-sm p-3" style={{ color: '#b3382f' }}>Error: {error}</div>}
      {loading && <div className="text-sm p-6 text-center" style={{ color: '#6b7280' }}>Loading series…</div>}
      {!loading && !error && points.length === 0 && (
        <div className="text-sm p-6 text-center" style={{ color: '#6b7280' }}>Sem vendas no período selecionado.</div>
      )}
      {!loading && !error && points.length > 0 && (
        <>
          <BarLineChart
            title="MCL REAL / UN · GERAL (todos os SKUs)"
            data={points}
            color="#16A34A"
            unit="currency"
            market={market}
            height={240}
            referenceLines={[{ value: 0, color: '#9ca3af', label: 'breakeven', dashed: true }]}
            bare
          />
          <div className="text-[11px] mt-2" style={{ color: '#9ca3af' }}>
            Média ponderada por unidade de TODOS os SKUs. Base = preço ATUAL (hoje, catálogo) blended;
            desconto = markdown até o valor efetivamente vendido no período. Tax, duties e unidades:
            reais do período (orders Shopify, todos os produtos). COGS, devolução/troca/PIX: snapshot
            blended atual. Marketing por unidade: rateio de mercado. Verdes = MCL positiva, vermelhas = negativa.
          </div>
        </>
      )}
    </div>
  );
}

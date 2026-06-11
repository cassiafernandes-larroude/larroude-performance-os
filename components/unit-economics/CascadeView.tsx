'use client';

import { useState } from 'react';
import type { ProductUnitEconomics } from '@/lib/unit-economics/queries';
import type { CascadeUnit } from '@/lib/unit-economics/cascade';

interface VariantCascade {
  variant: ProductUnitEconomics;
  cascade: CascadeUnit;
}
interface Props {
  product: ProductUnitEconomics;
  cascade: CascadeUnit;
  variantCascades: VariantCascade[];
  currency: 'USD' | 'BRL';
}

function fmt(v: number, currency: 'USD' | 'BRL'): string {
  const s = currency === 'USD' ? '$' : 'R$';
  return `${s}${v.toLocaleString(currency === 'USD' ? 'en-US' : 'pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export default function CascadeView({ product, cascade, variantCascades, currency }: Props) {
  const [showVariants, setShowVariants] = useState(false);

  // Rows: label, value, type
  const rows: { label: string; value: number; type: 'add' | 'sub' | 'total' | 'highlight' }[] = [
    { label: 'Preço base (Shopify)', value: cascade.basePrice, type: 'add' },
    { label: 'Desconto comercial', value: -cascade.discount, type: 'sub' },
    { label: 'Receita efetiva (após PIX blend se BR)', value: cascade.effectiveRevenue, type: 'total' },
    { label: 'Impostos', value: -cascade.tax, type: 'sub' },
    { label: 'Devoluções', value: -cascade.refund, type: 'sub' },
    { label: '= Receita Líquida / un', value: cascade.netRevenue, type: 'highlight' },
    { label: 'COGS', value: -cascade.cogs, type: 'sub' },
    { label: 'Duties (tarifas importação)', value: -cascade.duties, type: 'sub' },
    { label: 'Taxa de cartão', value: -cascade.cardFee, type: 'sub' },
    { label: 'Frete (premissa)', value: -cascade.shipping, type: 'sub' },
    { label: 'Fulfillment (premissa)', value: -cascade.fulfillment, type: 'sub' },
    { label: 'Custo de troca (premissa)', value: -cascade.exchange, type: 'sub' },
    { label: '= MC BRUTA / un', value: cascade.grossContributionMargin, type: 'highlight' },
    { label: 'Marketing (real, rateado)', value: -cascade.marketingReal, type: 'sub' },
    { label: '= MC LÍQUIDA REAL / un', value: cascade.netCmReal, type: 'highlight' },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs font-mono opacity-60">{product.motherSku}</div>
          <div className="text-lg font-bold">{product.productName}</div>
          <div className="text-xs text-steel mt-1">
            {product.totalUnits.toLocaleString()} unidades · {product.totalOrders.toLocaleString()} pedidos
            {product.pixShare > 0 && <> · PIX share: {pct(product.pixShare)}</>}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto thin-scroll -mx-2 px-2">
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((r, idx) => {
            const isTotal = r.type === 'total' || r.type === 'highlight';
            const colorClass = r.type === 'sub' ? 'text-bad' : r.type === 'add' ? 'text-ink' : 'text-ink';
            return (
              <tr key={idx} className={isTotal ? 'border-t border-card-border' : ''}>
                <td
                  className="py-1.5 pr-2"
                  style={{
                    fontWeight: isTotal ? 700 : 500,
                    color: r.type === 'highlight' ? 'var(--accent)' : undefined,
                  }}
                >
                  {r.label}
                </td>
                <td className={`py-1.5 pl-2 text-right font-num ${colorClass}`} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: isTotal ? 700 : 500 }}>
                  {fmt(r.value, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Alternativa marketing premissa */}
      <div
        className="mt-4 p-3 rounded-lg flex items-center justify-between"
        style={{ background: '#fff7e0', border: '1px solid #f3e7c4' }}
      >
        <div className="text-[12px]">
          <strong>MC Líquida (Premissa Marketing %):</strong>
          <span className="ml-1 text-[11px] text-steel">
            Marketing = {fmt(cascade.marketingAssumption, currency)} / un
          </span>
        </div>
        <div className="font-num text-lg font-bold" style={{ color: cascade.netCmAssumption >= 0 ? '#2c7a5b' : '#b3382f' }}>
          {fmt(cascade.netCmAssumption, currency)}
        </div>
      </div>

      {/* Drill-down variants */}
      {variantCascades.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowVariants(!showVariants)}
            className="text-xs font-bold uppercase tracking-wider text-accent hover:opacity-70"
          >
            {showVariants ? '▾' : '▸'} Drill-down por SKU ({variantCascades.length})
          </button>
          {showVariants && (
            <div className="mt-3 overflow-x-auto thin-scroll">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase font-bold text-steel tracking-wide">
                    <th className="px-2 py-2">SKU</th>
                    <th className="px-2 py-2">Variant</th>
                    <th className="px-2 py-2 text-right">Un</th>
                    <th className="px-2 py-2 text-right">Preço</th>
                    <th className="px-2 py-2 text-right">COGS</th>
                    <th className="px-2 py-2 text-right">MC Bruta</th>
                    <th className="px-2 py-2 text-right">MC Líq Real</th>
                  </tr>
                </thead>
                <tbody>
                  {variantCascades.map(({ variant, cascade: c }) => (
                    <tr key={variant.variantSku} className="border-t border-card-border">
                      <td className="px-2 py-2 font-mono text-[11px]">{variant.variantSku}</td>
                      <td className="px-2 py-2 max-w-[200px] truncate">{variant.productName}</td>
                      <td className="px-2 py-2 text-right">{variant.totalUnits}</td>
                      <td className="px-2 py-2 text-right">{fmt(c.basePrice, currency)}</td>
                      <td className="px-2 py-2 text-right">{fmt(c.cogs, currency)}</td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: c.grossContributionMargin >= 0 ? '#2c7a5b' : '#b3382f' }}>
                        {fmt(c.grossContributionMargin, currency)}
                      </td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: c.netCmReal >= 0 ? '#2c7a5b' : '#b3382f' }}>
                        {fmt(c.netCmReal, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

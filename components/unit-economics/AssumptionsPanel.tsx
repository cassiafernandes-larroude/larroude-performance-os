'use client';

import type { Assumptions } from '@/lib/unit-economics/cascade';
import type { Market } from '@/lib/unit-economics/queries';

interface Props {
  assumptions: Assumptions;
  market: Market;
  onChange: (next: Assumptions) => void;
  onReset: () => void;
}

export default function AssumptionsPanel({ assumptions, market, onChange, onReset }: Props) {
  const currency = market === 'US' ? '$' : 'R$';

  function update<K extends keyof Assumptions>(key: K, value: Assumptions[K]) {
    onChange({ ...assumptions, [key]: value });
  }

  return (
    <section className="card mt-6 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-accent">
            ⚙️ PREMISSAS EDITÁVEIS — recalcula ao vivo
          </div>
          <div className="text-[11px] text-steel mt-1">
            Defaults validados em REGRAS-LARROUDE-OS.md seção 8.
          </div>
        </div>
        <button
          onClick={onReset}
          className="text-xs px-3 py-1.5 rounded-full font-semibold"
          style={{ background: '#ebe9e3', color: '#1a1a1a' }}
        >
          ↺ Reset defaults
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Field
          label="Desconto comercial"
          suffix="%"
          value={assumptions.discountPct * 100}
          onChange={(n) => update('discountPct', n / 100)}
          step={1}
          hint="0 = usa o real do Shopify"
        />
        <Field
          label="Cupom adicional"
          suffix="%"
          value={(assumptions.couponPct ?? 0) * 100}
          onChange={(n) => update('couponPct', n / 100)}
          step={1}
          hint="Aplicado APÓS desconto Shopify"
        />
        <Field
          label="Marketing %"
          suffix="% receita"
          value={assumptions.marketingPct * 100}
          onChange={(n) => update('marketingPct', n / 100)}
          step={1}
        />
        <Field
          label="Fulfillment"
          prefix={currency}
          suffix="/un"
          value={assumptions.fulfillmentPerUnit}
          onChange={(n) => update('fulfillmentPerUnit', n)}
          step={1}
        />
        <Field
          label="Frete (custo)"
          prefix={currency}
          suffix="/un"
          value={assumptions.shippingPerUnit}
          onChange={(n) => update('shippingPerUnit', n)}
          step={1}
        />
        <Field
          label="Taxa de cartão"
          suffix="%"
          value={assumptions.cardFeePct * 100}
          onChange={(n) => update('cardFeePct', n / 100)}
          step={0.1}
        />
        {market === 'BR' && (
          <Field
            label="Desconto PIX"
            suffix="%"
            value={assumptions.pixDiscountPct * 100}
            onChange={(n) => update('pixDiscountPct', n / 100)}
            step={1}
            hint="% PIX vem real do Shopify 30d"
          />
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-steel">{label}</span>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-[11px] text-steel">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          step={step ?? 1}
          className="flex-1 px-2 py-1.5 rounded-md text-[13px] font-num"
          style={{ border: '1px solid #e5e3de', background: '#fff', fontVariantNumeric: 'tabular-nums' }}
        />
        {suffix && <span className="text-[11px] text-steel whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="text-[10px] text-steel italic">{hint}</span>}
    </label>
  );
}

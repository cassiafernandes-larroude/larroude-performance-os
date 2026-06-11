'use client';

import { useMemo, useState } from 'react';
import type { ProductUnitEconomics } from '@/lib/unit-economics/queries';

interface Props {
  products: ProductUnitEconomics[];
  variants: ProductUnitEconomics[];
  selectedMotherSku: string | null;
  onSelect: (motherSku: string) => void;
  currency: 'USD' | 'BRL';
}

function fmt(v: number, currency: 'USD' | 'BRL', compact = false): string {
  const s = currency === 'USD' ? '$' : 'R$';
  if (compact && Math.abs(v) >= 1000) return `${s}${Math.round(v / 1000)}K`;
  return `${s}${Math.round(v)}`;
}

export default function ProductSelector({ products, variants, selectedMotherSku, onSelect, currency }: Props) {
  const [search, setSearch] = useState('');
  const variantsByMother = useMemo(() => {
    const map = new Map<string, ProductUnitEconomics[]>();
    for (const v of variants) {
      const arr = map.get(v.motherSku) ?? [];
      arr.push(v);
      map.set(v.motherSku, arr);
    }
    return map;
  }, [variants]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.motherSku.toLowerCase().includes(q) || p.productName.toLowerCase().includes(q)
    );
  }, [products, search]);

  return (
    <aside className="card p-3" style={{ maxHeight: '70vh', overflow: 'auto' }}>
      <div className="text-xs font-bold uppercase tracking-wider text-steel mb-2">
        Products ({products.length})
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search mother SKU or name…"
        className="w-full rounded-lg px-3 py-2 text-[12px] mb-2"
        style={{ border: '1px solid #e5e3de', background: '#faf8f3' }}
      />
      <div className="flex flex-col gap-1">
        {filteredProducts.map((p) => {
          const isSelected = p.motherSku === selectedMotherSku;
          const variantCount = variantsByMother.get(p.motherSku)?.length ?? 0;
          return (
            <button
              key={p.motherSku}
              onClick={() => onSelect(p.motherSku)}
              className="text-left px-3 py-2 rounded-lg transition"
              style={{
                background: isSelected ? '#1a1a1a' : '#faf8f3',
                color: isSelected ? '#fff' : '#1a1a1a',
                border: `1px solid ${isSelected ? '#1a1a1a' : '#e5e3de'}`,
              }}
            >
              <div className="text-[11px] font-mono opacity-70">{p.motherSku}</div>
              <div className="text-[12px] font-semibold truncate">{p.productName}</div>
              <div className="text-[10px] mt-1 flex items-center gap-2 opacity-80">
                <span>{p.totalUnits.toLocaleString()} un</span>
                <span>•</span>
                <span>{fmt(p.unitGrossRevenue, currency, true)}/un</span>
                {variantCount > 0 && (
                  <>
                    <span>•</span>
                    <span>{variantCount} variants</span>
                  </>
                )}
              </div>
            </button>
          );
        })}
        {filteredProducts.length === 0 && (
          <div className="text-xs text-steel italic p-2">No products found.</div>
        )}
      </div>
    </aside>
  );
}

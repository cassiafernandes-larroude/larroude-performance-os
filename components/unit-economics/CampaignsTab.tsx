"use client";

// Unit Economics — Campaigns tab.
// Cassia 2026-06-13: criar campanha, selecionar produtos (manual + bulk SKU
// paste), definir periodo, calcular descontos sugeridos, aplicar e listar.
// Persistencia client-side em localStorage (lpos-ue-campaigns).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Tag,
  Plus,
  Trash2,
  Calendar,
  Search,
  ClipboardList,
  Check,
  X,
  ArrowLeft,
  Package,
  DollarSign,
} from "lucide-react";
// Cassia 2026-06-14: incluir calculadora editável (mesma do UE Per Product)
import AssumptionsPanel from "./AssumptionsPanel";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "@/lib/unit-economics/cascade";

type Market = "US" | "BR";

const ASSUMPTIONS_STORAGE_KEY = "lpos-ue-campaigns-assumptions";

interface ProductRow {
  motherSku: string;
  productName: string;
  totalUnits: number;
  unitGrossRevenue: number;
  unitCogs: number;
  unitTax: number;
  unitDiscount: number;
  unitRefund: number;
  exchangeRate?: number;
  returnRate30d?: number;
  pixShare: number;
  currency: "USD" | "BRL";
}

interface ApiResponse {
  products: ProductRow[];
}

interface SelectedProduct {
  motherSku: string;
  productName: string;
  unitGrossRevenue: number;
  unitCogs: number;
  /** Margem antes do desconto */
  baseMargin: number;
  /** Desconto sugerido (0..1) — computed */
  suggestedDiscount: number;
  /** Desconto que sera aplicado (editavel) */
  appliedDiscount: number;
  /** Receita liquida apos desconto, COGS e custos */
  netMargin: number;
}

interface Campaign {
  id: string;
  name: string;
  market: Market;
  startDate: string;
  endDate: string;
  appliedAt: string;
  totalProducts: number;
  avgDiscount: number;
  expectedRevenue: number;
  expectedMargin: number;
  products: SelectedProduct[];
}

const STORAGE_KEY = "lpos-ue-campaigns";

function fmtMoney(v: number, market: Market): string {
  const symbol = market === "US" ? "$" : "R$";
  if (Math.abs(v) >= 1_000_000) return `${symbol}${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${symbol}${(v / 1_000).toFixed(1)}k`;
  return `${symbol}${v.toFixed(0)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calcula desconto sugerido baseado em margem.
 *  Regra: 30% se margem >= 60%, 25% se >= 50%, 20% se >= 40%, 15% se >= 30%, 10% caso contrário. */
function computeSuggestedDiscount(unitGrossRevenue: number, unitCogs: number): number {
  if (unitGrossRevenue <= 0) return 0;
  const margin = (unitGrossRevenue - unitCogs) / unitGrossRevenue;
  if (margin >= 0.6) return 0.3;
  if (margin >= 0.5) return 0.25;
  if (margin >= 0.4) return 0.2;
  if (margin >= 0.3) return 0.15;
  return 0.1;
}

function computeNetMargin(
  p: ProductRow,
  appliedDiscount: number,
  assumptions?: Assumptions,
): number {
  // Desconto principal + cupom extra (aplicado DEPOIS do desconto Shopify)
  const totalDiscount = appliedDiscount + (assumptions?.couponPct ?? 0) * (1 - appliedDiscount);
  const grossAfterDiscount = p.unitGrossRevenue * (1 - totalDiscount);
  // PIX desconto aplicado proporcionalmente à fatia PIX
  const pixCut = (assumptions?.pixDiscountPct ?? 0) * (p.pixShare || 0) * grossAfterDiscount;
  // Card fee aplicado na fatia não-PIX
  const cardFee = (assumptions?.cardFeePct ?? 0) * (1 - (p.pixShare || 0)) * grossAfterDiscount;
  // Marketing como % da receita líquida pós-desconto
  const marketingCost = (assumptions?.marketingPct ?? 0) * grossAfterDiscount;
  const fulfillment = assumptions?.fulfillmentPerUnit ?? 0;
  const shipping = assumptions?.shippingPerUnit ?? 0;
  return (
    grossAfterDiscount
    - p.unitCogs
    - p.unitTax
    - p.unitRefund
    - pixCut
    - cardFee
    - marketingCost
    - fulfillment
    - shipping
  );
}

export default function CampaignsTab() {
  const [market, setMarket] = useState<Market>("US");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(isoDaysAhead(14));
  const [selected, setSelected] = useState<Map<string, number>>(new Map()); // motherSku -> appliedDiscount
  const [search, setSearch] = useState("");
  const [bulkSkuPaste, setBulkSkuPaste] = useState("");
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ matched: number; missed: string[] } | null>(null);

  // Cassia 2026-06-14: assumptions editáveis por market (mesmo padrão da aba Per Product)
  const [assumptionsByMarket, setAssumptionsByMarket] = useState<Record<Market, Assumptions>>({
    US: { ...DEFAULT_ASSUMPTIONS.US },
    BR: { ...DEFAULT_ASSUMPTIONS.BR },
  });
  const assumptions = assumptionsByMarket[market];

  // Load campaigns + assumptions from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCampaigns(JSON.parse(raw));
      const rawAssump = localStorage.getItem(ASSUMPTIONS_STORAGE_KEY);
      if (rawAssump) {
        const saved = JSON.parse(rawAssump);
        setAssumptionsByMarket((cur) => ({ ...cur, ...saved }));
      }
    } catch {}
  }, []);

  // Persist assumptions
  useEffect(() => {
    try {
      localStorage.setItem(ASSUMPTIONS_STORAGE_KEY, JSON.stringify(assumptionsByMarket));
    } catch {}
  }, [assumptionsByMarket]);

  // Fetch products when market changes
  useEffect(() => {
    setLoading(true);
    fetch(`/api/unit-economics/${market}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        setProducts(data.products || []);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [market]);

  // Auto-fill suggested discounts when products load
  useEffect(() => {
    if (products.length === 0 || selected.size > 0) return;
    // não auto-seleciona — usuário escolhe
  }, [products, selected]);

  const productsByMotherSku = useMemo(() => {
    const m = new Map<string, ProductRow>();
    for (const p of products) m.set(p.motherSku.toLowerCase(), p);
    return m;
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.motherSku.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q)
    );
  }, [products, search]);

  function toggleProduct(p: ProductRow) {
    const next = new Map(selected);
    if (next.has(p.motherSku)) {
      next.delete(p.motherSku);
    } else {
      next.set(p.motherSku, computeSuggestedDiscount(p.unitGrossRevenue, p.unitCogs));
    }
    setSelected(next);
  }

  function updateDiscount(motherSku: string, value: number) {
    const next = new Map(selected);
    next.set(motherSku, Math.max(0, Math.min(0.9, value / 100)));
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Map());
  }

  function applyBulkPaste() {
    const lines = bulkSkuPaste
      .split(/[\n,;\t]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const next = new Map(selected);
    const missed: string[] = [];
    let matched = 0;
    for (const sku of lines) {
      const product = productsByMotherSku.get(sku);
      if (product) {
        if (!next.has(product.motherSku)) {
          next.set(
            product.motherSku,
            computeSuggestedDiscount(product.unitGrossRevenue, product.unitCogs)
          );
        }
        matched++;
      } else {
        missed.push(sku);
      }
    }
    setSelected(next);
    setBulkResult({ matched, missed });
  }

  function applyCampaign() {
    if (!name.trim()) {
      alert("Please name the campaign first.");
      return;
    }
    if (selected.size === 0) {
      alert("Select at least one product.");
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      alert("Invalid date range.");
      return;
    }

    const selectedProducts: SelectedProduct[] = Array.from(selected.entries()).map(
      ([motherSku, discount]) => {
        const p = products.find((x) => x.motherSku === motherSku)!;
        const baseMargin = p.unitGrossRevenue - p.unitCogs - p.unitTax - p.unitRefund;
        const netMargin = computeNetMargin(p, discount, assumptions);
        return {
          motherSku,
          productName: p.productName,
          unitGrossRevenue: p.unitGrossRevenue,
          unitCogs: p.unitCogs,
          baseMargin,
          suggestedDiscount: computeSuggestedDiscount(p.unitGrossRevenue, p.unitCogs),
          appliedDiscount: discount,
          netMargin,
        };
      }
    );

    const totalDiscount =
      selectedProducts.reduce((s, p) => s + p.appliedDiscount, 0) / selectedProducts.length;
    const expectedRevenue = selectedProducts.reduce(
      (s, p) => s + p.unitGrossRevenue * (1 - p.appliedDiscount),
      0
    );
    const expectedMargin = selectedProducts.reduce((s, p) => s + p.netMargin, 0);

    const campaign: Campaign = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      market,
      startDate,
      endDate,
      appliedAt: new Date().toISOString(),
      totalProducts: selectedProducts.length,
      avgDiscount: totalDiscount,
      expectedRevenue,
      expectedMargin,
      products: selectedProducts,
    };

    const next = [campaign, ...campaigns];
    setCampaigns(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}

    // Reset form
    setName("");
    setSelected(new Map());
    setBulkSkuPaste("");
    setBulkResult(null);
    setShowBulkPaste(false);
    alert(`Campaign "${campaign.name}" applied with ${campaign.totalProducts} products.`);
  }

  function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    const next = campaigns.filter((c) => c.id !== id);
    setCampaigns(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <div>
      {/* HEADER */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/unit-economics"
              className="inline-flex items-center gap-1 text-[12px]"
              style={{ color: "var(--ink-soft)" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Unit Economics
            </Link>
          </div>
          <h1
            className="font-display text-[26px] lg:text-[36px]"
            style={{ color: "var(--ink)" }}
          >
            Campaigns
          </h1>
          <p
            className="text-[12px] lg:text-[14px] mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            Build a discount campaign, select products (manually or by pasting SKUs),
            review the suggested discounts and apply.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMarket("US")}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: market === "US" ? "#FF3D8B" : "#FFFFFF",
              color: market === "US" ? "white" : "#1A1A1A",
              border: market === "US" ? "none" : "1.5px solid #E5E0D6",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            🇺🇸 US
          </button>
          <button
            onClick={() => setMarket("BR")}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: market === "BR" ? "#FF3D8B" : "#FFFFFF",
              color: market === "BR" ? "white" : "#1A1A1A",
              border: market === "BR" ? "none" : "1.5px solid #E5E0D6",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            🇧🇷 BR
          </button>
        </div>
      </div>

      {/* === ASSUMPTIONS PANEL — Cassia 2026-06-14 (calculadora editável recalcula ao vivo) === */}
      <AssumptionsPanel
        assumptions={assumptions}
        market={market}
        onChange={(next) =>
          setAssumptionsByMarket((cur) => ({ ...cur, [market]: next }))
        }
        onReset={() =>
          setAssumptionsByMarket((cur) => ({
            ...cur,
            [market]: { ...DEFAULT_ASSUMPTIONS[market] },
          }))
        }
      />

      {/* === BUILDER === */}
      <div className="card mb-6" style={{ padding: 20, marginTop: 20 }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-1">
            <label
              className="text-[11px] uppercase tracking-wider font-semibold mb-1 block"
              style={{ color: "var(--ink-muted)" }}
            >
              Campaign name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Black Friday 2026"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border, #E5E0D6)",
                background: "white",
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label
              className="text-[11px] uppercase tracking-wider font-semibold mb-1 block"
              style={{ color: "var(--ink-muted)" }}
            >
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border, #E5E0D6)",
                background: "white",
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label
              className="text-[11px] uppercase tracking-wider font-semibold mb-1 block"
              style={{ color: "var(--ink-muted)" }}
            >
              End date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border, #E5E0D6)",
                background: "white",
                fontSize: 13,
              }}
            />
          </div>
        </div>

        {/* Product selector header */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" style={{ color: "var(--ink-soft)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              Select products ({selected.size}/{products.length})
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                background: "var(--paper, #F2EDE6)",
                borderRadius: 999,
                border: "1px solid var(--border, #E5E0D6)",
              }}
            >
              <Search className="w-3.5 h-3.5" style={{ color: "var(--ink-muted)" }} />
              <input
                type="text"
                placeholder="Search SKU or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 12,
                  outline: "none",
                  width: 200,
                }}
              />
            </div>
            <button
              onClick={() => setShowBulkPaste((s) => !s)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: showBulkPaste ? "#FF3D8B" : "#FFFFFF",
                color: showBulkPaste ? "white" : "#1A1A1A",
                border: showBulkPaste ? "none" : "1.5px solid #E5E0D6",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Paste SKU list
            </button>
            {selected.size > 0 && (
              <button
                onClick={clearSelection}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#FFFFFF",
                  color: "#DC2626",
                  border: "1.5px solid #FEE2E2",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Clear ({selected.size})
              </button>
            )}
          </div>
        </div>

        {/* Bulk SKU paste */}
        {showBulkPaste && (
          <div
            className="card mb-3"
            style={{ background: "var(--paper)", padding: 14 }}
          >
            <div
              className="text-[11px] uppercase tracking-wider font-semibold mb-2"
              style={{ color: "var(--ink-muted)" }}
            >
              Paste SKUs (one per line, or separated by comma / tab)
            </div>
            <textarea
              value={bulkSkuPaste}
              onChange={(e) => setBulkSkuPaste(e.target.value)}
              placeholder={"FLAT001-BLK\nSANDAL027-RED\nHEEL445-CAM\n..."}
              style={{
                width: "100%",
                minHeight: 100,
                padding: 10,
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                resize: "vertical",
              }}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={applyBulkPaste}
                disabled={!bulkSkuPaste.trim()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "#FF3D8B",
                  color: "white",
                  border: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  opacity: bulkSkuPaste.trim() ? 1 : 0.5,
                }}
              >
                Match &amp; select
              </button>
              {bulkResult && (
                <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                  ✓ {bulkResult.matched} matched
                  {bulkResult.missed.length > 0 && (
                    <span style={{ color: "#DC2626" }}>
                      {" "}
                      · {bulkResult.missed.length} not found:{" "}
                      <code style={{ fontSize: 10 }}>
                        {bulkResult.missed.slice(0, 5).join(", ")}
                        {bulkResult.missed.length > 5 ? "..." : ""}
                      </code>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Product table */}
        <div
          className="card"
          style={{
            padding: 0,
            maxHeight: 380,
            overflowY: "auto",
            background: "var(--paper, #FAFAFA)",
          }}
        >
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--ink-muted)" }}>
              Loading products...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--ink-muted)" }}>
              No products found.
            </div>
          ) : (
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase" }}>Select</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase" }}>Product</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase" }}>Price</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase" }}>COGS</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase" }}>Margin %</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase" }}>Discount</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase" }}>Net Margin</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const isSelected = selected.has(p.motherSku);
                  const discount = selected.get(p.motherSku) ?? computeSuggestedDiscount(p.unitGrossRevenue, p.unitCogs);
                  const marginPct = p.unitGrossRevenue > 0 ? ((p.unitGrossRevenue - p.unitCogs) / p.unitGrossRevenue) * 100 : 0;
                  const netMargin = computeNetMargin(p, discount, assumptions);
                  return (
                    <tr
                      key={p.motherSku}
                      style={{
                        borderBottom: "1px solid var(--border-soft, #EDE8DF)",
                        background: isSelected ? "rgba(255, 61, 139, 0.05)" : "transparent",
                        cursor: "pointer",
                      }}
                      data-row-type="product"
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProduct(p)}
                          style={{ accentColor: "#FF3D8B", cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "8px 12px" }} onClick={() => toggleProduct(p)}>
                        <div className="product-name" style={{ fontWeight: 600 }}>{p.productName}</div>
                        <div className="sku" style={{ fontSize: 10, color: "var(--ink-muted)" }}>{p.motherSku}</div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(p.unitGrossRevenue, market)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-soft)" }}>
                        {fmtMoney(p.unitCogs, market)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {marginPct.toFixed(0)}%
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        {isSelected ? (
                          <input
                            type="number"
                            value={Math.round(discount * 100)}
                            onChange={(e) => updateDiscount(p.motherSku, Number(e.target.value))}
                            min={0}
                            max={90}
                            style={{
                              width: 60,
                              padding: "4px 8px",
                              border: "1px solid #FF3D8B",
                              borderRadius: 6,
                              fontSize: 12,
                              textAlign: "right",
                              background: "white",
                              color: "#FF3D8B",
                              fontWeight: 700,
                            }}
                          />
                        ) : (
                          <span style={{ color: "var(--ink-muted)" }}>
                            {(computeSuggestedDiscount(p.unitGrossRevenue, p.unitCogs) * 100).toFixed(0)}%
                            <span style={{ fontSize: 9, marginLeft: 4 }}>(sug.)</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: netMargin >= 0 ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                        {fmtMoney(netMargin, market)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Apply button */}
        <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
          <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
            {selected.size > 0 && (
              <>
                Avg discount:{" "}
                <b>
                  {(
                    (Array.from(selected.values()).reduce((s, v) => s + v, 0) / selected.size) *
                    100
                  ).toFixed(1)}
                  %
                </b>
              </>
            )}
          </div>
          <button
            onClick={applyCampaign}
            disabled={selected.size === 0 || !name.trim()}
            style={{
              padding: "12px 24px",
              borderRadius: 999,
              background: "#FF3D8B",
              color: "white",
              border: "none",
              fontWeight: 700,
              fontSize: 13,
              cursor: selected.size > 0 && name.trim() ? "pointer" : "not-allowed",
              opacity: selected.size > 0 && name.trim() ? 1 : 0.5,
              boxShadow: "0 2px 8px rgba(255, 61, 139, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Check className="w-4 h-4" />
            Apply campaign ({selected.size} products)
          </button>
        </div>
      </div>

      {/* === APPLIED CAMPAIGNS LIST === */}
      <div className="section-marker mb-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}
        >
          Applied campaigns ({campaigns.length})
        </span>
      </div>
      {campaigns.length === 0 ? (
        <div
          className="card text-center"
          style={{ padding: 32, color: "var(--ink-muted)" }}
        >
          <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-[13px]">
            No campaigns yet. Build one above and click "Apply".
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="card" style={{ padding: 16 }} data-row-type="campaign">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="campaign-name"
                      style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}
                    >
                      {c.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: c.market === "US" ? "#DBEAFE" : "#DCFCE7",
                        color: c.market === "US" ? "#1E40AF" : "#166534",
                        fontWeight: 700,
                      }}
                    >
                      {c.market}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {c.startDate} → {c.endDate}
                    {" · "}
                    Applied {new Date(c.appliedAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
                <button
                  onClick={() => deleteCampaign(c.id)}
                  title="Delete campaign"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "#FFFFFF",
                    color: "#DC2626",
                    border: "1.5px solid #FEE2E2",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Products</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{c.totalProducts}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Avg discount</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#FF3D8B" }}>{(c.avgDiscount * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Expected revenue / unit</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(c.expectedRevenue / Math.max(1, c.totalProducts), c.market)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Expected margin / unit</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c.expectedMargin >= 0 ? "#16A34A" : "#DC2626" }}>
                    {fmtMoney(c.expectedMargin / Math.max(1, c.totalProducts), c.market)}
                  </div>
                </div>
              </div>
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--ink-soft)",
                    fontWeight: 600,
                    userSelect: "none",
                  }}
                >
                  Show {c.totalProducts} products
                </summary>
                <div style={{ marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
                  <table style={{ width: "100%", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-soft)" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, color: "var(--ink-muted)", textTransform: "uppercase" }}>Product</th>
                        <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 9, color: "var(--ink-muted)", textTransform: "uppercase" }}>Price</th>
                        <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 9, color: "var(--ink-muted)", textTransform: "uppercase" }}>Discount</th>
                        <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 9, color: "var(--ink-muted)", textTransform: "uppercase" }}>Net Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.products.map((p) => (
                        <tr key={p.motherSku} style={{ borderBottom: "1px solid var(--border-soft)" }} data-row-type="product">
                          <td style={{ padding: "6px 8px" }}>
                            <div className="product-name">{p.productName}</div>
                            <div className="sku" style={{ fontSize: 9, color: "var(--ink-muted)" }}>{p.motherSku}</div>
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(p.unitGrossRevenue, c.market)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", color: "#FF3D8B", fontWeight: 700 }}>{(p.appliedDiscount * 100).toFixed(0)}%</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.netMargin >= 0 ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                            {fmtMoney(p.netMargin, c.market)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

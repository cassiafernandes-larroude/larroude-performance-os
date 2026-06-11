/**
 * Lógica de cascata Unit Economics — pura, sem I/O.
 * Aplica premissas editáveis ao vivo (cliente recalcula sem ir ao servidor).
 *
 * REGRA: GUARD-RAILS aplicados aqui (REGRAS-LARROUDE-OS.md):
 *   - NÃO dupla-conta a taxa de cartão (Shopify fee já é cartão)
 *   - NÃO dupla-conta desconto (net_sales já líquido)
 *   - COGS sempre por unidade
 *   - Moeda separada (US=USD, BR=BRL)
 */

import type { ProductUnitEconomics, Market } from './queries';

export interface Assumptions {
  /** Desconto comercial extra (SIMULADOR a partir do preço de lista). 0..1 */
  discountPct: number;
  /** Marketing % sobre receita (alternativa ao real atribuído). 0..1 */
  marketingPct: number;
  /** Fulfillment $/un (premissa pura — não existe no Shopify) */
  fulfillmentPerUnit: number;
  /** Frete $/un (custo real ao carrier — Shopify só tem o cobrado) */
  shippingPerUnit: number;
  /** Custo de troca $/un (premissa pura) */
  exchangePerUnit: number;
  /** Taxa de cartão %. Default 0.025 (2.5%) */
  cardFeePct: number;
  /** % vendas via PIX (BR apenas, 0..1). Default 0 = usa pixShare real do Shopify */
  pixSharePctOverride: number | null;
  /** Desconto PIX %. Default 0.15 (15%) */
  pixDiscountPct: number;
}

export const DEFAULT_ASSUMPTIONS: Record<Market, Assumptions> = {
  US: {
    discountPct: 0, // desconto extra (simulador) — 0 = usa o real do Shopify
    marketingPct: 0.20,
    fulfillmentPerUnit: 8,
    shippingPerUnit: 12,
    exchangePerUnit: 0,
    cardFeePct: 0.025,
    pixSharePctOverride: null, // US não tem PIX
    pixDiscountPct: 0,
  },
  BR: {
    discountPct: 0,
    marketingPct: 0.20,
    fulfillmentPerUnit: 15, // BRL
    shippingPerUnit: 25, // BRL
    exchangePerUnit: 0,
    cardFeePct: 0.025,
    pixSharePctOverride: null, // usa o real do Shopify
    pixDiscountPct: 0.15,
  },
};

export interface CascadeUnit {
  /** Preço base (preço de lista ou Shopify gross) */
  basePrice: number;
  /** Aplicando desconto comercial premissa, se houver */
  discount: number;
  /** Receita efetiva considerando PIX blend (BR) */
  effectiveRevenue: number;
  tax: number;
  refund: number;
  netRevenue: number;
  cogs: number;
  duties: number;
  cardFee: number;
  shipping: number;
  fulfillment: number;
  exchange: number;
  /** = netRevenue - cogs - duties - cardFee - shipping - fulfillment - exchange */
  grossContributionMargin: number;
  /** = MCB - marketing real */
  netCmReal: number;
  /** = MCB - (marketingPct × effectiveRevenue) */
  netCmAssumption: number;
  /** Marketing $/un real (vem do rateio) */
  marketingReal: number;
  /** Marketing $/un baseado em premissa */
  marketingAssumption: number;
  /** % MC bruta sobre receita */
  gcmPctOfRevenue: number;
  returnRate: number;
}

export function computeCascade(
  product: ProductUnitEconomics,
  assumptions: Assumptions,
  market: Market,
  marketingPerUnitReal: number
): CascadeUnit {
  // 1. Preço de lista (Shopify gross_revenue / units = preço médio bruto)
  const basePrice = product.unitGrossRevenue;

  // 2. Desconto: REGRA — net_sales já é líquido de desconto Shopify.
  //    O controle "discountPct" é simulador que SUBSTITUI a receita base.
  //    Se discountPct > 0, aplica em cima do basePrice. Senão, usa o desconto real
  //    que veio do Shopify (product.unitDiscount).
  const useSimulatedDiscount = assumptions.discountPct > 0;
  const discount = useSimulatedDiscount ? basePrice * assumptions.discountPct : product.unitDiscount;
  const priceAfterDiscount = basePrice - discount;

  // 3. PIX blend (BR apenas): receita efetiva ponderada
  const pixShare = market === 'BR'
    ? assumptions.pixSharePctOverride ?? product.pixShare
    : 0;
  const pixDisc = market === 'BR' ? assumptions.pixDiscountPct : 0;
  const effectiveRevenue = priceAfterDiscount * (pixShare * (1 - pixDisc) + (1 - pixShare));

  // 4. Impostos (vem do Shopify) — já em $/un
  const tax = product.unitTax;

  // 5. Refunds — já em $/un
  const refund = product.unitRefund;

  const netRevenue = effectiveRevenue - tax - refund;

  // 6. COGS + duties
  const cogs = product.unitCogs;
  const duties = product.unitDuties;

  // 7. Card fee: incide apenas sobre a parte NÃO-PIX
  const nonPixPortion = priceAfterDiscount * (1 - pixShare);
  const cardFee = nonPixPortion * assumptions.cardFeePct;

  // 8. Premissas puras
  const shipping = assumptions.shippingPerUnit;
  const fulfillment = assumptions.fulfillmentPerUnit;
  // Custo de troca (Cassia 2026-06-10): usa exchangeRate REAL dos ultimos 30d.
  // Cada unidade trocada custa (shipping + fulfillment) extra (logistica reversa).
  // Fallback pra premissa pura se nao houver dado real.
  const exchangeRate = product.exchangeRate ?? 0;
  const exchange =
    exchangeRate > 0
      ? exchangeRate * (shipping + fulfillment)
      : assumptions.exchangePerUnit;

  // Margem de Contribuição Bruta
  const grossContributionMargin = netRevenue - cogs - duties - cardFee - shipping - fulfillment - exchange;

  // 9. Marketing: 2 versões — real (atribuído) e premissa (% sobre receita)
  const marketingReal = marketingPerUnitReal;
  const marketingAssumption = effectiveRevenue * assumptions.marketingPct;

  const netCmReal = grossContributionMargin - marketingReal;
  const netCmAssumption = grossContributionMargin - marketingAssumption;

  // Helpers UI
  const gcmPctOfRevenue = effectiveRevenue > 0 ? grossContributionMargin / effectiveRevenue : 0;
  const returnRate = product.unitGrossRevenue > 0 ? refund / product.unitGrossRevenue : 0;

  return {
    basePrice,
    discount,
    effectiveRevenue,
    tax,
    refund,
    netRevenue,
    cogs,
    duties,
    cardFee,
    shipping,
    fulfillment,
    exchange,
    grossContributionMargin,
    netCmReal,
    netCmAssumption,
    marketingReal,
    marketingAssumption,
    gcmPctOfRevenue,
    returnRate,
  };
}

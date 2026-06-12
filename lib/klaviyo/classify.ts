/**
 * Classificação Campaign Type e Flow Type/Category.
 * Regex EN + PT (BR). Normaliza NFD para ignorar acentos.
 *
 * IMPORTANTE: ordem de avaliação de FlowCategory:
 * LIFECYCLE_OTHER é avaliado PRIMEIRO porque Opensend e Credit Redemption
 * têm overlap com outras categorias (Cassia 2026-06-11).
 */

import type { CampaignType, FlowType, FlowCategory } from './types';

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ============================================================================
// Campaign Type
// ============================================================================
export function classifyCampaign(name: string): CampaignType {
  const n = normalize(name);
  if (/markdown|outlet|sale\b|promo|saldao|desconto|liquida/i.test(n)) return 'MARKDOWN';
  if (/flash|24h|relampago|flash sale/i.test(n)) return 'FLASH';
  if (/pre[\s_-]?order|preorder|pre[\s_-]?venda/i.test(n)) return 'PREORDER';
  if (/\bvip\b|loyalty|fidelidade|insider/i.test(n)) return 'VIP';
  if (/newsletter|news/i.test(n)) return 'NEWSLETTER';
  if (/full[\s_-]?price|launch|lancamento|novidade/i.test(n)) return 'FULLPRICE';
  return 'OTHER';
}

// ============================================================================
// Flow Type
// ============================================================================
export function classifyFlow(name: string): FlowType {
  const n = normalize(name);
  if (/welcome|boas[\s_-]?vindas|pre[\s_-]?purchase trust|fluxo confianca/i.test(n)) return 'WELCOME';
  if (/abandoned checkout|abandoned cart|carrinho abandonado|bco|abandono checkout/i.test(n)) return 'ABANDONED_CHECKOUT';
  if (/browse abandon|site abandon|navegacao abandonada|abandono navegacao/i.test(n)) return 'BROWSE_ABANDON';
  if (/post[\s_-]?purchase|order follow|2nd purchase|segunda compra|acompanhamento|sticker peel/i.test(n)) return 'POST_PURCHASE';
  if (/winback|win[\s_-]?back|at risk|em risco/i.test(n)) return 'WINBACK';
  if (/birthday|aniversario/i.test(n)) return 'BIRTHDAY';
  if (/price drop|baixou de preco|reducao de preco/i.test(n)) return 'PRICE_DROP';
  if (/back in stock|bis|de volta ao estoque/i.test(n)) return 'BACK_IN_STOCK';
  if (/sunset|prevencao de churn|inativo/i.test(n)) return 'SUNSET';
  if (/cross[\s_-]?sell|next purchase nudge|next best/i.test(n)) return 'CROSS_SELL';
  if (/opensend/i.test(n)) return 'OPENSEND';
  if (/credit redemption|resgate credito/i.test(n)) return 'CREDIT_REDEMPTION';
  if (/okendo|review/i.test(n)) return 'REVIEW';
  return 'OTHER';
}

// ============================================================================
// Flow Category (sub-tabs no dashboard)
// LIFECYCLE_OTHER avaliado PRIMEIRO (overlap com outras).
// ============================================================================
export function classifyFlowCategory(name: string): FlowCategory {
  const n = normalize(name);

  // 1. LIFECYCLE_OTHER — PRIMEIRO (overlap com outras)
  if (/opensend|credit redemption|resgate credito|okendo|review|birthday|aniversario|rfm/i.test(n)) {
    return 'LIFECYCLE_OTHER';
  }

  // 2. TRIGGERS — eventos pontuais
  if (/abandoned (checkout|cart)|carrinho abandonado|abandono checkout|bco|browse abandon|site abandon|navegacao abandonada|abandono navegacao|back in stock|bis|de volta ao estoque|price drop|baixou de preco|reducao de preco/i.test(n)) {
    return 'TRIGGERS';
  }

  // 3. POST_PURCHASE — pós-venda
  if (/post[\s_-]?purchase|order follow|2nd purchase|segunda compra|acompanhamento|sticker peel/i.test(n)) {
    return 'POST_PURCHASE';
  }

  // 4. FAMILY_CROSSSELL — afinidade + crosssell
  if (/cross[\s_-]?sell|next purchase nudge|next best|category social proof|prova social|predictive/i.test(n)) {
    return 'FAMILY_CROSSSELL';
  }

  // 5. HYGIENE_WINBACK — limpar base + reativar
  if (/sunset|winback|win[\s_-]?back|at risk|em risco|prevencao de churn|unengaged|inativo/i.test(n)) {
    return 'HYGIENE_WINBACK';
  }

  // 6. WELCOME_TRUST — entrada
  if (/welcome|boas[\s_-]?vindas|pre[\s_-]?purchase trust|fluxo confianca|ambassador|embaixador|subscribe/i.test(n)) {
    return 'WELCOME_TRUST';
  }

  // Default: lifecycle other
  return 'LIFECYCLE_OTHER';
}

export const FLOW_CATEGORY_LABELS: Record<FlowCategory, string> = {
  WELCOME_TRUST: 'Welcome & Trust',
  HYGIENE_WINBACK: 'Hygiene & Winback',
  FAMILY_CROSSSELL: 'Family & Cross-Sell',
  POST_PURCHASE: 'Post-Purchase',
  TRIGGERS: 'Triggers',
  LIFECYCLE_OTHER: 'Lifecycle & Other',
};

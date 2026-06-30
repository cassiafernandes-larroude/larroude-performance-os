import type { CampaignType, FlowType, FlowCategory } from '@/types/klaviyo/models';

// Cassia 2026-06-20: rótulos e código de nome para os 6 tipos do dashboard (usados pelo Gerador de Campanhas).
export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  FULLPRICE: 'Full Price',
  MARKDOWN: 'Markdown / Sale',
  PREORDER: 'Pre-Order',
  FLASH: 'Flash',
  VIP: 'VIP',
  OTHER: 'Outros',
};

// Código usado no nome do rascunho — segue os PREFIXOS REAIS da conta (AAAAMMDD_<CODE>_<slug>).
// A conta só usa 4 prefixos: FP/MD/PO/CS. VIP e FLASH são markdowns (ex.: MD_VIP50EarlyAccess,
// MD_WeekendRush24hLeft); Outros ≈ CS. O slug carrega o detalhe (ex.: MD_VIPEarlyAccess).
export const CAMPAIGN_TYPE_CODE: Record<CampaignType, string> = {
  FULLPRICE: 'FP',
  MARKDOWN: 'MD',
  PREORDER: 'PO',
  FLASH: 'MD',
  VIP: 'MD',
  OTHER: 'CS',
};

// Classificação automática por nome — baseada nos benchmarks documentados.
export function classifyCampaign(name: string): CampaignType {
  const n = (name || '').toUpperCase();
  if (/(^|[\s_-])VIP(\d|$|[\s_-])|VIPCUSTOMERS/.test(n)) return 'VIP';
  if (/FLASH|LAST\s*CHANCE|LAST\s*CALL|\b24H\b|TODAY\s*ONLY/.test(n)) return 'FLASH';
  if (/MD_|SALE|\bOFF\b|LIQUIDA|MARKDOWN|DISCOUNT|UP\s*TO\s*\d/.test(n)) return 'MARKDOWN';
  if (/PO_|NEW\s*ARRIV|LAUNCH|DROP|PRE[-\s]*ORDER|PREORDER/.test(n)) return 'PREORDER';
  if (/FP_|EDITORIAL|HARDWARE|RAINBOW|STORY/.test(n)) return 'FULLPRICE';
  return 'OTHER';
}

export function classifyFlow(name: string): FlowType {
  const n = normalize(name);
  // EN + PT-BR
  if (/abandoned\s*checkout|abandoned\s*cart|carrinho\s*abandonad|checkout\s*abandonad|added\s*to\s*cart/.test(n)) return 'ABANDONED_CHECKOUT';
  if (/browse\s*abandon|navegacao\s*abandonad|abandono\s*de\s*navega|abandono\s*de\s*site|site\s*abandon/.test(n)) return 'BROWSE_ABANDON';
  if (/welcome|opensend|boas[-\s]*vindas|bem[-\s]*vindo/.test(n)) return 'WELCOME';
  if (/price\s*drop|preco\s*caiu|back\s*in\s*stock|de\s*volta\s*ao\s*estoque|reposic|\bbis\b/.test(n)) return 'PRICE_DROP';
  if (/post[-\s]*purchase|pos[-\s]*compra|2nd\s*purchase|segunda\s*compra|cross[-\s]*sell|next\s*purchase|review|okendo|order\s*follow|sticker\s*peel|peel|acompanhamento\s*do?\s*pedido/.test(n)) return 'POST_PURCHASE';
  if (/winback|sunset|reconnect|reativ|reengaj|prevencao\s*de\s*churn|churn/.test(n)) return 'WINBACK';
  if (/birthday|countdown|aniversari/.test(n)) return 'BIRTHDAY';
  return 'OTHER';
}

// Normaliza pra busca: lowercase + remove acentos
function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function isCsFlow(name: string): boolean {
  return /\bcs\b|customer\s*service|order\s*follow\s*up\s*-\s*cs/i.test(name || '');
}

// Cassia 2026-06-29: campanhas do time de CS (Customer Success/Service) — a conta usa o prefixo CS_
// (ex.: 20260617_CS_OrderUpdate). Excluídas de TODAS as métricas (inflam os números).
export function isCsCampaign(name: string): boolean {
  return /(^|[_\s-])CS([_\s-]|$)|customer\s*success|customer\s*service/i.test(name || '');
}

// Classifica flows nas 6 categorias top-level (sub-abas).
// Ordem de avaliação importa — categorias mais específicas primeiro.
export function classifyFlowCategory(name: string): FlowCategory {
  const n = normalize(name);

  // LIFECYCLE & OUTROS (PRIMEIRO — Opensend / Credit Redemption / Reviews)
  // EN: opensend, credit redemption, okendo review, birthday, RFM
  // PT: aniversari, indicacao, review/avaliacao, credito, opensend
  if (/opensend|credit\s*redemption|credito\s*resgat|resgate\s*de\s*credito|okendo|review\s*request|avaliac|review|birthday|countdown|aniversari|rfm/.test(n)) return 'LIFECYCLE_OTHER';

  // TRIGGERS: cart, browse, site abandon, BIS, price drop
  // PT: carrinho abandonado, checkout abandonado, navegacao abandonada, abandono de site, de volta ao estoque, preco caiu, reposicao
  if (/abandoned\s*checkout|abandoned\s*cart|carrinho\s*abandonad|checkout\s*abandonad|added\s*to\s*cart|browse\s*abandon|navegacao\s*abandonad|abandono\s*de\s*navega|abandono\s*de\s*site|site\s*abandon|\bbco\b|back\s*in\s*stock|de\s*volta\s*ao\s*estoque|reposic|price\s*drop|preco\s*caiu|\bbis\b|black\s*crow/.test(n)) return 'TRIGGERS';

  // POS-COMPRA: order follow up · 2nd Purchase · Separate Shipment · acompanhamento
  if (/order\s*follow\s*up|2nd\s*purchase|second\s*purchase|segunda\s*compra|separate\s*shipment|envio\s*separad|placed\s*order\s*>\s*update|sticker\s*peel|acompanhamento\s*do?\s*pedido|pos[-\s]*compra/.test(n)) return 'POST_PURCHASE';

  // FAMILIA & CROSS-SELL: category social proof · next best · cross-sell
  // PT: prova social, categoria, proximo melhor, recomendacao
  if (/family\s*cross|cross[-\s]*sell|venda\s*cruzad|next\s*purchase\s*nudge|proxima\s*compra|next\s*best\s*product|proximo\s*melhor|category\s*social\s*proof|prova\s*social|complementary|predictive|preditiv|recomendac/.test(n)) return 'FAMILY_CROSSSELL';

  // HIGIENIZACAO & WINBACK: sunset, winback, at risk, unengaged, reativacao, churn
  if (/sunset|winback|win[-\s]*back|unengaged|at\s*risk|em\s*risco|reactivat|reativ|reengaj|lapsed|prevencao\s*de\s*churn|prevencao\s*do?\s*churn|churn/.test(n)) return 'HYGIENE_WINBACK';

  // WELCOME & TRUST: welcome series, pre-purchase trust, ambassador
  // PT: boas-vindas, fluxo confianca, fluxo de confianca, embaixador
  if (/welcome|boas[-\s]*vindas|bem[-\s]*vindo|pre[-\s]*purchase\s*trust|pre[-\s]*compra\s*confianc|fluxo\s*confianc|fluxo\s*de\s*confianc|confianca\s*pre\s*compra|subscribe\s*to\s*larroud|filled\s*out\s*lead|leads\s*pre\s*order|b2b\s*contact|ambassador|embaixador/.test(n)) return 'WELCOME_TRUST';

  return 'LIFECYCLE_OTHER';
}

// Benchmarks Larroudé — p25 baseline / p75 target (documentado em /docs)
export const CAMPAIGN_BENCHMARKS: Record<CampaignType, { orBaseline: number; orTarget: number; ctrBaseline: number; ctrTarget: number; rprBaseline: number; rprTarget: number }> = {
  MARKDOWN:  { orBaseline: 60, orTarget: 65, ctrBaseline: 0.50, ctrTarget: 1.30, rprBaseline: 0.10, rprTarget: 0.18 },
  FLASH:     { orBaseline: 58, orTarget: 63, ctrBaseline: 0.28, ctrTarget: 0.55, rprBaseline: 0.06, rprTarget: 0.08 },
  PREORDER:  { orBaseline: 61, orTarget: 67, ctrBaseline: 0.32, ctrTarget: 0.82, rprBaseline: 0.05, rprTarget: 0.11 },
  FULLPRICE: { orBaseline: 63, orTarget: 70, ctrBaseline: 0.32, ctrTarget: 0.80, rprBaseline: 0.03, rprTarget: 0.08 },
  VIP:       { orBaseline: 52, orTarget: 59, ctrBaseline: 1.20, ctrTarget: 2.00, rprBaseline: 0.32, rprTarget: 0.50 },
  OTHER:     { orBaseline: 55, orTarget: 62, ctrBaseline: 0.30, ctrTarget: 0.80, rprBaseline: 0.05, rprTarget: 0.10 }
};

export const FLOW_BENCHMARKS: Record<FlowType, { orBaseline: number; orTarget: number; ctrBaseline: number; ctrTarget: number; rprBaseline: number; rprTarget: number }> = {
  ABANDONED_CHECKOUT: { orBaseline: 57, orTarget: 63, ctrBaseline: 2.4, ctrTarget: 5.0, rprBaseline: 3.80, rprTarget: 8.00 },
  BROWSE_ABANDON:     { orBaseline: 44, orTarget: 47, ctrBaseline: 1.1, ctrTarget: 1.8, rprBaseline: 0.22, rprTarget: 0.34 },
  WELCOME:            { orBaseline: 45, orTarget: 55, ctrBaseline: 0.6, ctrTarget: 1.0, rprBaseline: 0.13, rprTarget: 0.25 },
  PRICE_DROP:         { orBaseline: 33, orTarget: 48, ctrBaseline: 2.0, ctrTarget: 5.0, rprBaseline: 0.43, rprTarget: 1.00 },
  POST_PURCHASE:      { orBaseline: 52, orTarget: 56, ctrBaseline: 0.8, ctrTarget: 1.5, rprBaseline: 0.10, rprTarget: 0.30 },
  WINBACK:            { orBaseline: 40, orTarget: 50, ctrBaseline: 0.5, ctrTarget: 1.2, rprBaseline: 0.15, rprTarget: 0.40 },
  BIRTHDAY:           { orBaseline: 50, orTarget: 60, ctrBaseline: 1.0, ctrTarget: 2.0, rprBaseline: 0.25, rprTarget: 0.60 },
  OTHER:              { orBaseline: 45, orTarget: 55, ctrBaseline: 0.8, ctrTarget: 1.5, rprBaseline: 0.10, rprTarget: 0.25 }
};

export function signalFor(orPct: number, ctrPct: number, rpr: number, bm: { orBaseline: number; orTarget: number; ctrBaseline: number; ctrTarget: number; rprBaseline: number; rprTarget: number }): 'SCALE' | 'FIX' | 'STOP' | 'MIXED' {
  const above = (orPct >= bm.orTarget ? 1 : 0) + (ctrPct >= bm.ctrTarget ? 1 : 0) + (rpr >= bm.rprTarget ? 1 : 0);
  const below = (orPct < bm.orBaseline ? 1 : 0) + (ctrPct < bm.ctrBaseline ? 1 : 0) + (rpr < bm.rprBaseline ? 1 : 0);
  if (above >= 2) return 'SCALE';
  if (below >= 2) return 'STOP';
  if (below === 1) return 'FIX';
  return 'MIXED';
}

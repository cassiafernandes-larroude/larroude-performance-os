// =====================================================================
// REGRA CANONICA — UTM patterns por canal
// Cassia 2026-06-14: nao adivinhar. Patterns descobertos via SELECT
// REGEXP_EXTRACT(landing_site, r'utm_source=([a-z0-9._\-]+)') no BigQuery
// stg_shopify.orders e stg_shopify_br.orders (90 dias).
//
// Padroes encontrados no Shopify:
//   - Awin:       utm_source=awin           (US: 535 ord/$185k, BR: ativo)
//   - ShopMy:     utm_source=shopmy         (US: 451 ord/$136k, BR: ativo)
//   - Agent.shop: utm_source=agent-shop     (BR apenas — com hifen)
//   - Klaviyo:    utm_source=klaviyo
//   - Attentive:  utm_source=attentive | utm_medium=sms
//   - Criteo:     "criteo" no landing OR referring
//   - Meta:       utm_source=(meta|facebook|ig_paid|...) | utm_medium=cpc/cpm
//   - Google:     utm_source=google + cpc | gclid=
//
// TODA classificacao de canal (revenue) e calculo de custo (%) DEVE usar
// estes patterns. Nao reescrever inline em queries.
// =====================================================================

export const CHANNEL_UTM_PATTERNS = {
  // Affiliates (% receita)
  awin: "utm_source=awin",
  shopmy: "utm_source=shopmy",
  agentShop: "utm_source=agent-shop", // BR apenas, sempre com hifen

  // Owned (tools fixed cost)
  klaviyo: "utm_source=klaviyo",
  attentive: "utm_source=attentive|utm_medium=sms",

  // Paid
  meta: "utm_source=(meta|facebook|ig_paid|ig_ads|fb_ads|fb|instagram_paid|fb_paid)",
  metaWithMedium: "utm_source=(instagram|facebook|meta|fb|ig)",
  metaPaidMediums: "utm_medium=(paid|cpc|cpm|social_paid|paidsocial|paid_social)",
  googleAds: "utm_source=google.*utm_medium=cpc|gclid=",
  criteo: "criteo",
} as const;

// Canal label normalizado por pattern key — usar em SQL CASE WHEN
export const CHANNEL_LABELS = {
  awin: "Awin Affiliate",
  shopmy: "ShopMy",
  agentShop: "Agent.shop",
  klaviyo: "Klaviyo Email",
  attentive: "SMS Attentive",
  meta: "Meta Ads",
  google: "Google Ads",
  criteo: "Criteo",
  organicSearch: "Orgânico Search",
  organicSocial: "Orgânico Social",
  noUtm: "Sem UTM / Direto",
  others: "Outros",
} as const;

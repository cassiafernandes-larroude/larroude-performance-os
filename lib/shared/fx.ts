// Cassia 2026-07-02: fallback FX USD→BRL ÚNICO quando gold.fx_rates_monthly não responde.
// Antes cada módulo tinha sua cópia (5.0 no product-funnel vs 5.45 no resto do painel) e os
// números divergiam. Atualizar AQUI quando o câmbio mudar de patamar (~5.45 em Mai/2026).
export const FX_BRL_FALLBACK = 5.45;

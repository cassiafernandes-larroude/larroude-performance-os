// Cassia 2026-06-29: versão de cache do Klaviyo CRM. Vai como `&v=` nas URLs do dashboard e do warm
// cron. O edge CDN (s-maxage 12h) é keyed por URL — sem isso, mudanças de lógica (ex.: exclusão de CS,
// formatação RPR) só apareceriam após 12h. Bumpar este valor a cada mudança de lógica busta o edge
// na hora, mantendo o cache DENTRO do deploy (mesma URL p/ todos os usuários). O backend ignora `v`.
export const KLAVIYO_CACHE_V = 'v20260630-cs-rpr';

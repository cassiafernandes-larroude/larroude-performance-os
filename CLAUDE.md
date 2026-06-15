# Larroudé Performance OS — Guia de continuidade para Claude

Este arquivo orienta qualquer instância do Claude que abrir este repositório. Leia-o antes de tocar em qualquer código.

## Repositório e deploy

- **GitHub**: https://github.com/cassiafernandes-larroude/larroude-performance-os
- **Branch principal**: `main` (push direto)
- **Pasta local sugerida**: `C:\Projects\lpos`
- **Production URL**: https://larroude-performance-os.vercel.app
- **Projeto Vercel**: `larroude-performance-os` (org `cassiafernandes-larroudes-projects`)

### Como continuar em outra máquina/conta

```powershell
cd C:\Projects
git clone https://github.com/cassiafernandes-larroude/larroude-performance-os.git lpos
cd lpos
# .env não é versionado — copie de C:\Projects\.env ou recrie a partir do Obsidian
```

Para deploy: Vercel está conectado via GitHub webhook. Quando o auto-deploy falha (raro), rode `vercel --prod --yes` na pasta. O CLI Vercel está autenticado na máquina da Cássia.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind + chart.js. Sem ORM. BigQuery direto via `@google-cloud/bigquery`. Shopify Admin GraphQL. Meta Graph API direta + Supermetrics como fallback.

## Preferências do usuário (Cássia) — SEMPRE seguir

1. **Consultar `.env` em `C:\Projects`** antes de qualquer coisa.
2. **Consultar Obsidian** em `C:\Projects\obsidian-vault` (regras, decisões).
3. **BigQuery `larroude-data-prod`** é a fonte da verdade.
4. **Sempre PowerShell** para shell (não bash).
5. **Salvar projetos concluídos no Obsidian** como skill + no agente designado.

## Regras de negócio críticas

### DTC only (Direct-to-Consumer)
Filtros aplicados em **TODAS** as queries Shopify (Main / CAC / LTV / Overview / North Star / Consolidated):

- Excluir tags: `b2b | wholesale | marketplace | redo` (case-insensitive)
- Threshold de valor por order: US > $30k → excluir, BR > R$25k → excluir
- BR adicional: `financial_status NOT IN ('pending','expired','authorized')` (PIX não-pago)
- `cancelled_at IS NULL`, `test = FALSE`
- LTV adicional: excluir trocas (Loop Returns EXC-*, TroquEcommerce)

Funções centralizadas:
- `lib/main-dashboard/queries.ts` → `shopifyOrderFilters(market)`
- `lib/cac-dashboard/queries-bq.ts` → `shopifyFilters(market)`
- `lib/ltv-dashboard/queries.ts` → `COMMON_FILTERS_DTC(market)`

### TOTAL SPEND = todos os canais
Spend nunca é só Meta+Google. Inclui sempre:

- US: Meta + Google + Klaviyo + Attentive + Criteo + Awin + ShopMy + Agent.shop
- BR: Meta + Google + Klaviyo + Criteo + Agent.shop (10% revenue) + Awin

Source of truth: `lib/channel-costs-bq.ts` → `computeTotalSpend(market, start, end, metaSpend, googleSpend)`.

### Ajuste manual Meta US +$400k Setembro/2025
Hardcoded em `lib/shared/meta-adjustments.ts` (regra Cassia, REGRAS-LARROUDE-OS.md seção 3.3). Pro-rata pelos dias do período que overlap com Set/2025. Aplicado em Main / CAC / LTV / Overview / Consolidated.

### Timezone por mercado
- US: `America/New_York`
- BR: `America/Sao_Paulo`

Sempre usar `DATE(created_at, '${TZ[market]}')` em queries BQ.

### Pixel Meta duplicado até 18/Fev/2026
Eventos de compra Meta estavam duplicados em meses anteriores a 18/Fev/2026. Mostrar disclaimer em views mensais via `<DuplicatePurchasesDisclaimer />` (Meta Ads MonthlyRoas, LTV MonthlyChart, etc).

## Contas Meta Ads

- **US**: Larroudé US (act_id 1) + PRE-ORDER US + Larroude New (`312869193575906`)
- **BR**: Larroudé Brasil + Larroude BR - Pre-Order

Detalhes e regras em REGRAS-LARROUDE-OS.md no Obsidian.

## Convenções de código

- **Sem comments dispersos** — só quando explica regra de negócio. Sempre marcar `Cassia YYYY-MM-DD: ...` em mudanças significativas pra rastrear histórico.
- **Componentes nativos `lpos`** sempre que possível (não iframes). Veja `components/{main,cac,ltv,meta-ads,unit-economics}-dashboard|native/`.
- **`computeTotalSpend` em todas as funções de spend**. Não recalcule manualmente.
- **DTC filters via funções centralizadas** (acima). Nunca duplicar regex de tags.
- **Status Meta de ads**: usar `fetchAdsMetadataByIds(adIds)` (cache `no-store`) — NÃO usar `spend > 0` como proxy de "ativo".

## Operações git em sandbox

O sandbox Linux frequentemente bate em `.git/index.lock` (permission denied no `rm`). Workaround:

```powershell
if (Test-Path .git/index.lock) { Move-Item .git/index.lock .git/index.lock.bak -Force }
```

Use `Desktop_Commander` MCP pra rodar PowerShell no host quando precisar de credenciais GitHub auth.

## Status atual (Junho 2026)

Aba **Meta Ads** tem nav tabs (Performance / Creatives × Shopify):
- **Performance**: KPIs + Funnel + Audience + Campaigns/Ads tables + 5 blocos ROAS by dimension + Top 10 criativos + Per-Campaign Optimization (Sale only) + Top 5 URLs
- **Creatives × Shopify**: 2 quadros (Top 30 SKUs Shopify + SKUs com ads ativos fora do Top 30) cruzando vendas Shopify ↔ criativos Meta

Outras abas estáveis: Overview, Dashboard Principal, CAC, LTV, North Star, Consolidated, Channel Share, Unit Economics (com sub-abs Produtos + Apostar + Campaigns), Inventory, Klaviyo CRM, Klaviyo Journey, Site Performance, Shopify, Data Sources.

## Pendências conhecidas

- **Renovar META_ACCESS_TOKEN** (task #222) — token expirado, fallback Supermetrics ativo. Renovar via Meta Business → System Users.
- **Documentar clone Klaviyo no Obsidian** (task #239).

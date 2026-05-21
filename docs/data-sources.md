# Fontes de dados — Larroudé Performance OS

## BigQuery (fonte da verdade)

- **Projeto:** `larroude-data-platform`
- **Service Account:** já configurado (ver `C:\Projects\larroude-prod-dashboard\` como referência)
- **Roles necessárias:** `BigQuery Data Viewer`, `BigQuery Job User`

## Meta Ads

### US
- **act_2047856822417350** — Larroudé US (campanhas regulares)
- **act_929449929417505** — Larroudé US PRE-ORDER

### BR
- **act_1735567560524487** — Principal (confirmada)
- Conta 2 — a confirmar
- Conta 3 — a confirmar

## Shopify

- **US:** `larroude-com.myshopify.com` · API version `2025-01`
- **BR:** `larroude-brasil.myshopify.com` · API version `2025-01`

## Google Ads

- **Customer ID:** `7244161860`
- **GMC US:** `5747976495`
- ⚠️ Falta `refresh_token` para uso programático

## Klaviyo

- ⚠️ API keys ainda não configuradas
- MCP nativo disponível (segundo `C:\Projects\CLAUDE.md`)

## Anthropic (Ask Claude — Fase 4)

- ⚠️ Necessário API key (`ANTHROPIC_API_KEY`)

## Dashboards externos embedados (Fase 1)

| Rota interna | URL externa |
|---|---|
| `/dashboard-principal` | https://larroude-dashboard-performance.vercel.app |
| `/ltv-cohorts` | https://larroude-ltv-dashboard-app.vercel.app |

## Referências cruzadas

- Credenciais canônicas: `C:\Projects\.env`
- Vault Obsidian: `C:\Projects\BancoCentral\`
- Diretrizes operacionais: `C:\Projects\BancoCentral\01 — Operações\Diretrizes para Claude.md`

# ADR-001 — Stack técnica

**Data:** 2026-05-21
**Status:** Aceito
**Autor:** Performance OS team

## Contexto

Precisamos escolher a stack para o Performance OS — sistema operacional que centraliza os dashboards existentes da Larroudé, gera diagnósticos automáticos e oferece interface de chat com Claude.

## Decisões

### Framework: Next.js 14 (App Router) + TypeScript

**Por quê:**
- Cassia já hospeda dashboards em Vercel (`larroude-dashboard-performance.vercel.app`, `larroude-ltv-dashboard-app.vercel.app`) — Next.js + Vercel é a stack natural.
- App Router permite Server Components para queries pesadas no BQ sem expor credenciais.
- API Routes nativas para proxy BQ / Meta / Klaviyo / Shopify.
- TypeScript strict para evitar regressões em métricas (CAC, ROAS, etc.).

**Trade-offs aceitos:**
- Curva de aprendizado de RSC para devs vindos de Pages Router.

### Estilos: Tailwind + CSS variables custom

**Por quê:**
- Velocidade de iteração.
- Design system da Larroudé (paper, ink, pink) já está mapeado em CSS variables no protótipo HTML.
- Tailwind se integra direto às vars via `tailwind.config.ts`.

### Tipografia: Inter via `next/font`

Validada no protótipo. `font-feature-settings: 'cv11', 'ss01', 'ss03'` + `tabular-nums` para métricas.

### Iframes na Fase 1, componentes nativos depois

**Por quê:**
- Os dashboards atuais (`larroude-dashboard-performance.vercel.app`, etc.) já funcionam — embedar via iframe entrega valor imediato.
- A migração para componentes nativos (Recharts) acontece progressivamente conforme a camada de dados unificada (Fase 2) fica pronta.

**Trade-offs:**
- Iframes não compartilham filtros globais (resolvido na Fase 5 com migração).
- PostMessage entre shell ↔ iframe pode ser adicionado na Fase 2.

## Diferenças vs briefing original

| Item briefing | Decisão final | Motivo |
|---|---|---|
| Auth Clerk | Adiada | Cassia é a única usuária por ora; mais simples começar sem auth e adicionar depois |
| Supabase | Adiada para Fase 3 | Chat history e diagnósticos só entram na Fase 3+ |
| Upstash Redis | Adiada para Fase 2 | Cache só faz sentido quando tiver dados reais |
| shadcn/ui | Componentes inline | Reduz dependências; vai puxar shadcn pontualmente conforme necessário |

## Consequências

- Setup mais leve e rápido na Fase 1.
- Compatível 100% com o protótipo HTML.
- Permite deploy imediato no Vercel.

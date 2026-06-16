# ADR-002 — Iframe vs componente nativo

**Data:** 2026-05-21
**Status:** Aceito (Fase 1)

## Contexto

Os dashboards existentes (`larroude-dashboard-performance.vercel.app`, `larroude-ltv-dashboard-app.vercel.app`, e os que virão) já estão em produção. Precisamos decidir como integrá-los ao Performance OS:

A. Embedar via `<iframe>`
B. Reescrever como componentes nativos (Recharts) que consomem a API unificada
C. Híbrido — começar com A, migrar progressivamente para B

## Decisão

**Híbrido (C).** Fase 1 usa iframes. Fase 5 migra para componentes nativos.

## Trade-offs

| Critério | Iframe | Nativo |
|---|---|---|
| Time to first value | ✅ Imediato | ❌ Reescrever cada dashboard |
| Filtros globais (US/BR, período) | ❌ Sem sync | ✅ Sync nativo |
| Performance | ⚠️ Duplica bundle | ✅ Único bundle |
| Manutenção | ✅ Cada dashboard mantém seu repo | ⚠️ Tudo num lugar |
| Deep linking | ❌ Limitado | ✅ Total |
| Print/PDF unificado | ❌ Difícil | ✅ Fácil |

## Mitigação dos pontos ruins do iframe (Fase 1)

- Wrapper `DashboardEmbed` com botão "Atualizar" e link "Abrir em nova aba".
- `X-Frame-Options: SAMEORIGIN` no Next config (segurança).
- Fase 2: adicionar `postMessage` entre shell e iframes para sincronizar filtros.

## Critério para migrar um dashboard de iframe para nativo

Migrar quando pelo menos 2 destes são verdade:
1. O dashboard precisa receber filtros do shell (mercado/período).
2. O dashboard é consultado >5× por dia.
3. O dashboard tem componentes reutilizáveis em outras rotas.
4. A camada de dados unificada (Fase 2) já cobre 100% dos dados que ele consome.

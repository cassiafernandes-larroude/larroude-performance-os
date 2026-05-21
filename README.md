# Larroudé · Performance OS

Sistema operacional de performance da Larroudé — centraliza dashboards existentes via embed, gera diagnósticos automáticos cruzando fontes, e oferece chat com Claude para perguntar sobre os dados.

**Status:** Fase 1 — Shell + Daily Briefing mock + 4 dashboards embedados.

## 🚀 Ativar tudo (1 comando)

Abra o **PowerShell** dentro de `C:\Projects\larroude-performance-os` e rode:

```powershell
# pode ter que liberar execução de script primeiro:
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\setup.ps1
```

O script faz tudo: limpa estado sujo do sandbox, `npm install`, `npm run build`, `git init`, cria repo no GitHub (se tiver `gh` CLI logado) e faz deploy no Vercel (se tiver `vercel` CLI logado).

Ao final ele imprime a **URL de produção do Vercel**.

### Pré-requisitos na sua máquina

- Node 20+ (`node --version`)
- npm (já vem com Node)
- (opcional, recomendado) `gh` CLI logado: https://cli.github.com/
- (opcional, recomendado) `vercel` CLI logado: `npm i -g vercel && vercel login`

Se você não tiver `gh` ou `vercel`, o script avisa e pula essas etapas — você pode criar repo + deploy manualmente depois.

## Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Estilos:** Tailwind CSS + CSS variables (design system Larroudé)
- **Tipografia:** Inter via `next/font`
- **Ícones:** lucide-react
- **Deploy:** Vercel

## Setup (PowerShell)

```powershell
cd C:\Projects\larroude-performance-os

# 1. Instalar dependências
pnpm install
# ou: npm install

# 2. Configurar env
Copy-Item .env.example .env.local
# editar .env.local — credenciais já estão em C:\Projects\.env

# 3. Rodar dev
pnpm dev
# abre http://localhost:3000
```

Se preferir npm:
```powershell
npm install
npm run dev
```

## Estrutura

```
larroude-performance-os/
├── app/
│   ├── layout.tsx            # Shell global (sidebar + chat drawer)
│   ├── page.tsx              # Daily Briefing (rota /)
│   ├── globals.css           # Design system completo (CSS variables)
│   ├── dashboard-principal/  # iframe Dashboard Principal
│   ├── ltv-cohorts/          # iframe LTV Dashboard
│   ├── glossario/            # Tabela canônica de KPIs
│   ├── fontes/               # Status das integrações
│   └── (demais rotas)        # Placeholders para Fases 2/3/4
├── components/
│   ├── layout/               # Shell, Sidebar, MobileHeader, ChatDrawer
│   ├── cards/                # MetricCard, DiagnosticCard
│   ├── filters/              # FiltersBar (US/BR, período, datas)
│   └── dashboards/           # DashboardEmbed (wrapper de iframe)
├── public/
├── .env.example
└── README.md
```

## Roadmap (resumo)

| Fase | Escopo | Status |
|---|---|---|
| 🟢 Fase 1 | Shell + Daily Briefing mock + iframes | ✅ Esta entrega |
| 🟡 Fase 2 | Camada de dados unificada (BQ + APIs) | ⏳ Próxima |
| 🟠 Fase 3 | Inteligência (diagnósticos automáticos, anomalies) | ⏳ |
| 🔵 Fase 4 | Ask Claude (chat com tool use) | ⏳ |
| ⚪ Fase 5 | Migração progressiva de ifram
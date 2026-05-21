# ============================================
# Larroudé Performance OS — Setup + Deploy
# Executa: .\setup.ps1
# ============================================
# Faz tudo numa tacada:
# 1. Limpa .git travado do sandbox
# 2. npm install
# 3. npm run build (validação)
# 4. git init + commit inicial
# 5. Cria repo GitHub (se gh CLI instalado)
# 6. Deploy Vercel (se vercel CLI instalado/logado)
# ============================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Write-Step {
    param([string]$msg)
    Write-Host ""
    Write-Host ">>> $msg" -ForegroundColor Magenta
}

function Write-Ok {
    param([string]$msg)
    Write-Host "OK: $msg" -ForegroundColor Green
}

function Write-Skip {
    param([string]$msg)
    Write-Host "SKIP: $msg" -ForegroundColor Yellow
}

# ============================================
# 1. Limpar estado sujo do sandbox (.git, node_modules parcial)
# ============================================
Write-Step "1/6 Limpando estado sujo do sandbox..."
if (Test-Path .git) {
    Remove-Item -Recurse -Force .git -ErrorAction SilentlyContinue
    Write-Ok ".git removido"
}
if (Test-Path node_modules) {
    Write-Host "   removendo node_modules parcial (pode levar 30s)..." -ForegroundColor Gray
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    Write-Ok "node_modules limpo"
}
if (Test-Path package-lock.json) {
    Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
}

# ============================================
# 2. npm install (do zero, limpo)
# ============================================
Write-Step "2/6 Rodando npm install (pode levar 2-3 min)..."
$installResult = & npm install --no-audit --no-fund 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO no npm install:" -ForegroundColor Red
    Write-Host $installResult
    exit 1
}
Write-Ok "dependencias instaladas"

# ============================================
# 3. .env.local
# ============================================
Write-Step "3/6 Configurando .env.local..."
if (-not (Test-Path .env.local)) {
    Copy-Item .env.example .env.local
    Write-Ok ".env.local criado a partir do .env.example"
    Write-Host "   AVISO: edite .env.local com credenciais reais (C:\Projects\.env) antes do deploy" -ForegroundColor Yellow
} else {
    Write-Skip ".env.local ja existe"
}

# ============================================
# 4. Build local (validacao)
# ============================================
Write-Step "4/6 Rodando npm run build (validacao)..."
$buildResult = & npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO no build:" -ForegroundColor Red
    Write-Host $buildResult
    Write-Host ""
    Write-Host "Verifique os erros acima. Build NAO foi concluido." -ForegroundColor Red
    exit 1
}
Write-Ok "build concluido com sucesso"

# ============================================
# 5. Git init + commit
# ============================================
Write-Step "5/6 Inicializando Git..."
git init -q
git add .
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -q -m "feat: initial setup - Fase 1 (Shell + Daily Briefing + 4 dashboards embedados)"
Write-Ok "commit inicial criado"

# Repo já criado em: github.com/cassiafernandes-larroude/larroude-performance-os
# Configura remote e empurra usando Windows credential helper (vai abrir login do GitHub na primeira vez)
Write-Host "   Configurando remote..." -ForegroundColor Gray
git branch -M main
git remote add origin https://github.com/cassiafernandes-larroude/larroude-performance-os.git 2>$null
# se remote ja existia, atualiza
git remote set-url origin https://github.com/cassiafernandes-larroude/larroude-performance-os.git

Write-Host "   Push para GitHub (pode abrir tela de login na primeira vez)..." -ForegroundColor Gray
$pushResult = & git push -u origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Ok "push concluido: github.com/cassiafernandes-larroude/larroude-performance-os"
} else {
    Write-Host "ERRO no push:" -ForegroundColor Red
    Write-Host $pushResult
    Write-Host "Tente fazer login: git config --global credential.helper manager-core" -ForegroundColor Yellow
    Write-Host "Ou use GitHub Desktop para fazer o push." -ForegroundColor Yellow
}

# ============================================
# 6. Deploy Vercel
# ============================================
Write-Step "6/6 Deploy no Vercel..."

# tenta usar vercel CLI global, senao npx vercel
$vercelCmd = "vercel"
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    $vercelCmd = "npx vercel"
    Write-Host "   vercel CLI global nao encontrado. Usando npx vercel..." -ForegroundColor Gray
}

Write-Host "   Linkando projeto ao Vercel..." -ForegroundColor Gray
& cmd /c "$vercelCmd link --yes 2>&1"

Write-Host "   Puxando env vars existentes (se houver)..." -ForegroundColor Gray
& cmd /c "$vercelCmd env pull .env.local --yes 2>&1" | Out-Null

Write-Host "   Fazendo deploy producao..." -ForegroundColor Gray
$deployOutput = & cmd /c "$vercelCmd --prod --yes 2>&1"
Write-Host $deployOutput

# extrai URL de producao
$prodUrl = $deployOutput | Select-String -Pattern "https://[\w\-]+\.vercel\.app" | Select-Object -First 1
if ($prodUrl) {
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "DEPLOY COMPLETO!" -ForegroundColor Green
    Write-Host "URL: $($prodUrl.Matches[0].Value)" -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
}

Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  - rodar dev local: npm run dev" -ForegroundColor White
Write-Host "  - editar .env.local com credenciais reais" -ForegroundColor White
Write-Host "  - configurar env vars no painel Vercel" -ForegroundColor White

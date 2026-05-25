# =====================================================================
# Fix build error 48f1f53:
#   1. Regex chain quebrou SQL em shopify-dashboard (corrigido com alias)
#   2. Period type adicionou "today" mas periodToDays + formatPeriodLabel
#      nao tinham case -> erro TS strict
# =====================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== STATUS ===" -ForegroundColor Cyan
git status --short
Write-Host ""

Write-Host "=== DIFF ===" -ForegroundColor Cyan
git diff --stat
Write-Host ""

Write-Host "=== COMMIT + PUSH ===" -ForegroundColor Cyan
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "fix: build error 48f1f53 - periodToDays/formatPeriodLabel sem case 'today' + regex chain agressivo em shopify-dashboard substituido por alias" 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
Write-Host ""

Write-Host "=== LOG ===" -ForegroundColor Cyan
git log --oneline -3
Write-Host ""

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Aguarde ~1-2min e checa o status no GitHub:" -ForegroundColor Green
Write-Host "https://github.com/cassiafernandes-larroude/larroude-performance-os/commits/main" -ForegroundColor Cyan
Write-Host "Tem que estar 1/1 (verde)" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green

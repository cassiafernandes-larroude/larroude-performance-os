# =====================================================================
# Fix final: FiltersBar.tsx tinha map literal sem "today" + truncado no final
# Vercel build deu Type error: Property 'today' does not exist on type
#   { "7d": number; "14d": number; ... }
# =====================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== STATUS ===" -ForegroundColor Cyan
git status --short
Write-Host ""

Write-Host "=== COMMIT + PUSH ===" -ForegroundColor Cyan
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "fix: FiltersBar - add today em map de presetRange + completar arquivo truncado (faltava </button> e fechamento de CountryPill)" 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
Write-Host ""

Write-Host "=== LOG ===" -ForegroundColor Cyan
git log --oneline -3
Write-Host ""

Write-Host "===================================================" -ForegroundColor Green
Write-Host "TSC local passou sem erros. Aguarda ~2min e checa:" -ForegroundColor Green
Write-Host "  https://github.com/cassiafernandes-larroude/larroude-performance-os/commits/main" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Green

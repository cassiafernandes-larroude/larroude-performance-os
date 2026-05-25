# =====================================================================
# Adicionar conta Meta Ads US: Larroude New (312869193575906)
# Em lib/meta-api.ts + bump cache key metrics-v7 -> v8 (forcar refetch)
# =====================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== STATUS ===" -ForegroundColor Cyan
git status --short
Write-Host ""

Write-Host "=== COMMIT + PUSH ===" -ForegroundColor Cyan
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "data: incluir Meta Ads US 'Larroude New' (312869193575906) no spend total + bump metrics cache para v8" 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
Write-Host ""

Write-Host "=== LOG ===" -ForegroundColor Cyan
git log --oneline -3
Write-Host ""

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Aguarde ~2min e Ctrl+F5 em:" -ForegroundColor Green
Write-Host "  https://larroude-performance-os.vercel.app/" -ForegroundColor Cyan
Write-Host "AMOUNT SPENT US e META SPEND US devem aumentar" -ForegroundColor Green
Write-Host "(soma da nova conta Larroude New)" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green

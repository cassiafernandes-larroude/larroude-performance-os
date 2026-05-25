# =====================================================================
# Push: Overview today-only + Refresh button + ROAS TOTAL SALES
# =====================================================================
# Roda DENTRO de C:\Projects\lpos: .\push-overview-today.ps1
# =====================================================================

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== DIAGNOSTICO INICIAL ===" -ForegroundColor Cyan
Write-Host "Remote:" -ForegroundColor Gray
git remote -v
Write-Host ""
Write-Host "Branch:" -ForegroundColor Gray
git branch --show-current
Write-Host ""
Write-Host "Status:" -ForegroundColor Gray
git status --short
Write-Host ""

Write-Host "=== DIFF ===" -ForegroundColor Cyan
git diff --stat
Write-Host ""

Write-Host "=== COMMIT ===" -ForegroundColor Cyan
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "feat: Overview today-only com botao Refresh + ROAS TOTAL SALES no lugar de ROAS ORDER" 2>&1 | Out-Host
Write-Host ""

Write-Host "=== PUSH ===" -ForegroundColor Cyan
git push origin main 2>&1 | Out-Host
Write-Host ""

Write-Host "=== LOG ===" -ForegroundColor Cyan
git log --oneline -3
Write-Host ""

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Aguarde ~1-2min e abre (Ctrl+F5):" -ForegroundColor Green
Write-Host "  https://larroude-performance-os.vercel.app/" -ForegroundColor Cyan
Write-Host "Deve mostrar:" -ForegroundColor Green
Write-Host "  - Card 'Today - May 22, 2026' com botao 'Refresh now'" -ForegroundColor White
Write-Host "  - Dados do dia de hoje (US + BR)" -ForegroundColor White
Write-Host "  - Card 'ROAS TOTAL SALES' no lugar de 'ROAS ORDER'" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Green

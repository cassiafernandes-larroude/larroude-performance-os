# =====================================================================
# Fix: label do RefreshBar dizia "TODAY" + data de hoje, mas dados sao D-1
# Trocado para "YESTERDAY (D-1)" + data de ontem
# =====================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== STATUS ===" -ForegroundColor Cyan
git status --short
Write-Host ""

Write-Host "=== COMMIT + PUSH ===" -ForegroundColor Cyan
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "ui: RefreshBar label 'Yesterday (D-1)' + data de ontem (alinhado com dados servidos)" 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
Write-Host ""

Write-Host "=== LOG ===" -ForegroundColor Cyan
git log --oneline -3
Write-Host ""

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Aguarde ~2min e Ctrl+F5 em:" -ForegroundColor Green
Write-Host "  https://larroude-performance-os.vercel.app/" -ForegroundColor Cyan
Write-Host "Label deve mostrar 'YESTERDAY (D-1) - <data de ontem>'" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green

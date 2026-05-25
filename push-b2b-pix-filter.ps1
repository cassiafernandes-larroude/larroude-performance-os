# =====================================================================
# Push: B2B + PIX filter + Overview D-1 + carga rapida (Suspense narrativa)
# =====================================================================
# Roda em C:\Projects\lpos: .\push-b2b-pix-filter.ps1
# =====================================================================

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== STATUS ===" -ForegroundColor Cyan
git status --short
Write-Host ""

Write-Host "=== DIFF stat ===" -ForegroundColor Cyan
git diff --stat
Write-Host ""

Write-Host "=== COMMIT + PUSH ===" -ForegroundColor Cyan
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "data: excluir B2B (US+BR) e PIX nao pago (BR) em todas as queries; Overview muda para D-1 + Suspense na narrativa (carga rapida) + revalidate=60" 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
Write-Host ""

Write-Host "=== LOG ===" -ForegroundColor Cyan
git log --oneline -3
Write-Host ""

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Aguarde ~1-2min e abre (Ctrl+F5):" -ForegroundColor Green
Write-Host "  https://larroude-performance-os.vercel.app/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Esperar:" -ForegroundColor Green
Write-Host "  - Overview = D-1 (ontem) com label 'Today - <data>'" -ForegroundColor White
Write-Host "  - Cards carregam rapido (cards primeiro, narrativa depois - Suspense)" -ForegroundColor White
Write-Host "  - GROSS SALES US/BR sem B2B/wholesale" -ForegroundColor White
Write-Host "  - GROSS SALES BR sem PIX pendente/expirado/autorizado" -ForegroundColor White
Write-Host "  - ROAS GROSS, ROAS TOTAL SALES, AOV, CAC, new_customers ajustados" -ForegroundColor White
Write-Host "  - North Star + Executive + Shopify tambem refletem filtros" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Green

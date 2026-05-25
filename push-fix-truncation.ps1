# =====================================================================
# Fix truncation: 3 arquivos foram salvos truncados pelo Edit tool
#   - lib/utils/periods.ts (NUL bytes no final - corrigido)
#   - lib/data/executive.ts (terminava em "gross_" - completado)
#   - lib/data/shopify-dashboard.ts (terminava em "priority: 'high'," - completado)
# =====================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== STATUS ===" -ForegroundColor Cyan
git status --short
Write-Host ""

Write-Host "=== COMMIT + PUSH ===" -ForegroundColor Cyan
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "fix: complete 3 arquivos truncados (executive.ts, shopify-dashboard.ts, periods.ts) - causa build error 2b22dd4 com TS1005 expected '}' e TS1127 invalid character" 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
Write-Host ""

Write-Host "=== LOG ===" -ForegroundColor Cyan
git log --oneline -3
Write-Host ""

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Aguarde ~2min e checa:" -ForegroundColor Green
Write-Host "  https://github.com/cassiafernandes-larroude/larroude-performance-os/commits/main" -ForegroundColor Cyan
Write-Host "  Deve aparecer com check verde 1/1" -ForegroundColor Green
Write-Host "Depois Ctrl+F5 em:" -ForegroundColor Green
Write-Host "  https://larroude-performance-os.vercel.app/" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Green

# Aplica regra: +$400k Meta US em Set/2025 (off-platform / historico)
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "data: adicionar regra SPEND_ADJUSTMENTS - somar +`$400k ao Meta US em Set/2025 (off-platform) + corrigir RefreshBar truncado" 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
git log --oneline -3

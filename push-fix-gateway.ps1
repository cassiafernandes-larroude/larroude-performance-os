# Fix: coluna 'gateway' nao existe no schema BQ.
# Removido refs a gateway/payment_gateway_names em metrics.ts, northstar.ts, executive.ts, shopify-dashboard.ts.
# Cache keys bumpadas: metrics-v9, northstar-v6, executive-v5, shopify-v2.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
git add -A
git -c user.email="cassia.fernandes@larroude.com" -c user.name="Cassia Larroude" commit -m "fix(BR): remover refs a coluna 'gateway' (nao existe no schema BQ) das queries PIX. Filtro simplificado para financial_status NOT IN (pending,expired,authorized). Cache keys bumpadas (v9/v6/v5/v2)." 2>&1 | Out-Host
git push origin main 2>&1 | Out-Host
git log --oneline -3

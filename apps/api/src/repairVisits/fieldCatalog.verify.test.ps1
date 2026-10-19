param([switch]$CatalogOnly)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$container = 'repair-2b-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$testPassword = [guid]::NewGuid().ToString('N')
$saved = @{}
foreach ($key in @('NODE_ENV','DATABASE_URL','SEED_INTEGRATION_DATABASE_URL','REPORT_CHROMIUM_PATH')) { $saved[$key] = [Environment]::GetEnvironmentVariable($key) }
function Run-Gate([scriptblock]$Command) { & $Command; if ($LASTEXITCODE -ne 0) { throw 'Verification gate failed' } }
Push-Location $repo
try {
  Set-Location (Join-Path $repo 'apps/web')
  $env:REPORT_CHROMIUM_PATH = (node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
  if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Playwright Chromium is unavailable' }
  Run-Gate { docker run -d --rm --name $container -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e "POSTGRES_PASSWORD=$testPassword" -p 127.0.0.1:55432:5432 postgres:16-alpine }
  Set-Location (Join-Path $repo 'apps/api')
  if (!$CatalogOnly) {
  Run-Gate { npm run typecheck }
  Run-Gate { npm run build }
  Run-Gate { npm run test:historical-matrix }
  Run-Gate { npm run test:v6-evidence }
  Run-Gate { npm run test:wet-chemical-definition }
  Run-Gate { node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts src/repairVisits/fieldCatalog.test.ts }
  }
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    docker exec $container pg_isready -U inspection_app -d phase6_seed_integration
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not become ready' }
  $env:NODE_ENV = 'test'
  $env:SEED_INTEGRATION_DATABASE_URL = "postgres://inspection_app:${testPassword}@127.0.0.1:55432/phase6_seed_integration"
  $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
  $files = @('src/repairVisits/previousVisits.integration.test.ts')
  if (!$CatalogOnly) { $files += @('src/sync/fireAlarmV6Acceptance.integration.test.ts','src/sync/co2V7.integration.test.ts','src/sync/wetChemicalV7.integration.test.ts','src/sync/fireAlarmV7.integration.test.ts','src/sync/v7EvidenceRace.integration.test.ts') }
  foreach ($file in $files) {
    Run-Gate { node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file }
  }
  if (!$CatalogOnly) {
  Set-Location (Join-Path $repo 'apps/web')
  Run-Gate { npm run typecheck }
  Run-Gate { npm run build }
  Run-Gate { npm run test:v7-stale-evidence }
  }
  Set-Location $repo
  Run-Gate { git diff --check }
  git status --short
} finally {
  docker rm -f $container 2>$null | Out-Null
  foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key]) }
  Pop-Location
}

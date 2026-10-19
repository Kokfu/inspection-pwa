$ErrorActionPreference = 'Stop'
$w0Root = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$w0OriginalDirectory = (Get-Location).Path
$w0Container = 'w0-location-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$w0Started = $false
$w0Environment = @{}
foreach ($key in @('NODE_ENV', 'DATABASE_URL', 'SEED_INTEGRATION_DATABASE_URL', 'REPORT_CHROMIUM_PATH')) {
  $w0Environment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
function Assert-W0Command([string] $gate) {
  if ($LASTEXITCODE -ne 0) { throw "$gate failed (exit $LASTEXITCODE)" }
  Write-Output "PASS: $gate"
}
try {
  Set-Location $w0Root
  # Never inherit a runtime DATABASE_URL. Only the disposable loopback database is used.
  $env:NODE_ENV = 'test'
  $env:SEED_INTEGRATION_DATABASE_URL = 'postgres://inspection_app:w0-disposable-only@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
  docker run -d --rm --name $w0Container -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=w0-disposable-only -p 127.0.0.1:55432:5432 postgres:16-alpine
  Assert-W0Command 'start cold disposable PostgreSQL'
  $w0Started = $true
  $w0Ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker exec $w0Container pg_isready -U inspection_app -d phase6_seed_integration
    if ($LASTEXITCODE -eq 0) { $w0Ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$w0Ready) { throw 'Disposable PostgreSQL did not become ready' }
  Set-Location (Join-Path $w0Root 'apps/web')
  $w0Playwright = (node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
  Assert-W0Command 'resolve Chromium'
  $w0Candidates = @($w0Playwright, $w0Environment['REPORT_CHROMIUM_PATH'], 'C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
  $env:REPORT_CHROMIUM_PATH = $w0Candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
  if (!$env:REPORT_CHROMIUM_PATH) { throw 'Install Chromium or set REPORT_CHROMIUM_PATH to an installed Chromium executable' }
  Set-Location (Join-Path $w0Root 'apps/api')
  npm run typecheck
  Assert-W0Command 'API typecheck'
  npm run build
  Assert-W0Command 'API build'
  node --import tsx --test src/inspections/locationConfiguration.test.ts src/inspections/locationProposal.test.ts src/routes/locationProposalReview.test.ts src/routes/legacyLocationProposalRejection.test.ts
  Assert-W0Command 'location units and unchanged legacy rejection'
  # Separate processes: each suite owns and closes its pool. Do not run DB suites concurrently.
  foreach ($file in @('src/db/locationProposalMigration.integration.test.ts', 'src/routes/locationProposals.integration.test.ts', 'src/routes/locationProposalsW0.integration.test.ts')) {
    node --import tsx --test $file
    Assert-W0Command $file
  }
  foreach ($gate in @('test:historical-matrix', 'test:v6-evidence', 'test:wet-chemical-definition')) {
    npm run $gate
    Assert-W0Command $gate
  }
  node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts
  Assert-W0Command 'V7 contracts and configuration'
  npm run test:v6-integration
  Assert-W0Command 'V6 integration'
  foreach ($file in @('src/sync/co2V7.integration.test.ts', 'src/sync/wetChemicalV7.integration.test.ts', 'src/sync/fireAlarmV7.integration.test.ts', 'src/sync/v7EvidenceRace.integration.test.ts')) {
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file
    Assert-W0Command $file
  }
  Set-Location (Join-Path $w0Root 'apps/web')
  $env:NODE_ENV = 'production'
  npm run typecheck
  Assert-W0Command 'web typecheck'
  npm run build
  Assert-W0Command 'web build'
  & ../api/node_modules/.bin/tsx.cmd --test tests/locationProposalApiW0.test.ts tests/locationProposalList.test.ts tests/locationProposalReviewShape.test.ts tests/queuedWriteRefusal.test.ts tests/roleAccess.test.ts
  Assert-W0Command 'web API contracts and regressions'
  npm run test:v7-stale-evidence
  Assert-W0Command 'web stale evidence'
  Set-Location $w0Root
  git diff --check
  Assert-W0Command 'diff check'
  git status --short
} finally {
  if ($w0Started) { docker rm -f $w0Container }
  foreach ($key in $w0Environment.Keys) { [Environment]::SetEnvironmentVariable($key, $w0Environment[$key], 'Process') }
  Set-Location $w0OriginalDirectory
}

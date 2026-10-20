$ErrorActionPreference = 'Stop'
Set-Location C:\PWA_OfflineRecordWebApp
# Create first so even a failed port bind can clean up only this run's container ID.
$r2ContainerName = 'r2-remark-verify-' + [guid]::NewGuid().ToString('N')
$r2ContainerId = docker create --name $r2ContainerName -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=r2-disposable-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable DB could not be created.' }
$previousDatabase = $env:DATABASE_URL
$previousSeedDatabase = $env:SEED_INTEGRATION_DATABASE_URL
$previousNodeEnv = $env:NODE_ENV
$previousChromium = $env:REPORT_CHROMIUM_PATH
try {
  docker start $r2ContainerId
  if ($LASTEXITCODE -ne 0) { throw 'Disposable DB could not start; 127.0.0.1:55432 may be occupied. No existing container was stopped.' }
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $r2ContainerId pg_isready -U inspection_app -d phase6_seed_integration
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not become ready.' }
  if (@(Get-ChildItem apps/api/migrations/057_*.sql).Count -ne 1) { throw 'Migration 057 must have exactly one file.' }
  $env:NODE_ENV = 'test'
  $env:SEED_INTEGRATION_DATABASE_URL = 'postgres://inspection_app:r2-disposable-only@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
  Set-Location C:\PWA_OfflineRecordWebApp\apps\web
  $env:REPORT_CHROMIUM_PATH = (node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Playwright Chromium is unavailable.' }
  Set-Location C:\PWA_OfflineRecordWebApp\apps\api
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
  node --import tsx --test src/routes/serviceCommonRemarks.test.ts src/inspections/siteProposal.test.ts src/routes/managerRouteOrder.test.ts src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Unit regressions failed.' }
  foreach ($gate in @('test:historical-matrix', 'test:v6-evidence', 'test:wet-chemical-definition')) {
    npm run $gate
    if ($LASTEXITCODE -ne 0) { throw "Failed: $gate" }
  }
  # Separate processes, sequential: each integration suite closes its pool and rebuilds public.
  foreach ($file in @('src/routes/remarkRequests.integration.test.ts', 'src/routes/sectionRemarks.integration.test.ts',
      'src/routes/sectionRemarksWebContract.integration.test.ts', 'src/routes/siteProposals.integration.test.ts')) {
    node --import tsx --test $file
    if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
  }
  Set-Location C:\PWA_OfflineRecordWebApp
  # PowerShell 5.1 turns git's LF/CRLF notices on stderr into a terminating error; only the exit code matters here.
  $ErrorActionPreference = 'Continue'
  git diff --check 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Diff whitespace check failed.' }
} finally {
  $env:DATABASE_URL = $previousDatabase
  $env:SEED_INTEGRATION_DATABASE_URL = $previousSeedDatabase
  $env:NODE_ENV = $previousNodeEnv
  $env:REPORT_CHROMIUM_PATH = $previousChromium
  Set-Location C:\PWA_OfflineRecordWebApp
  docker rm -f $r2ContainerId
}

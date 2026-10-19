$ErrorActionPreference = 'Stop'
Set-Location C:\PWA_OfflineRecordWebApp
$failures = [System.Collections.Generic.List[string]]::new()
function Gate([string]$name, [scriptblock]$command) {
  Write-Output "GATE: $name"
  & $command
  if ($LASTEXITCODE -ne 0) { $failures.Add($name); Write-Output "FAIL: $name" }
  else { Write-Output "PASS: $name" }
}

Set-Location C:\PWA_OfflineRecordWebApp\apps\web
if (!$env:REPORT_CHROMIUM_PATH -or !(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH -PathType Leaf)) {
  $playwrightChromium = (node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve Playwright Chromium' }
  $browserCandidates = @(
    $playwrightChromium,
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  $env:REPORT_CHROMIUM_PATH = $browserCandidates | Where-Object {
    Test-Path -LiteralPath $_ -PathType Leaf
  } | Select-Object -First 1
}
if (!$env:REPORT_CHROMIUM_PATH) { throw 'Set REPORT_CHROMIUM_PATH to an installed Chromium, Chrome or Edge executable' }
Write-Output "PDF browser: $env:REPORT_CHROMIUM_PATH"
Set-Location C:\PWA_OfflineRecordWebApp\apps\api
Gate 'API typecheck' { npm run typecheck }
Gate 'API build' { npm run build }
Gate 'Historical matrix' { npm run test:historical-matrix }
Gate 'V6 evidence' { npm run test:v6-evidence }
Gate 'Wet Chemical definition' { npm run test:wet-chemical-definition }
Gate 'V7 contracts, config and unchanged online unit tests' {
  node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts src/jobs/serviceVisits.test.ts src/jobs/offlineServiceVisitContract.test.ts
}

# Only this disposable, named test container is removed. Runtime Compose is never used.
docker container inspect repair-2a-verify *> $null
if ($LASTEXITCODE -eq 0) { docker rm -f repair-2a-verify }
docker run -d --rm --name repair-2a-verify -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app `
  -e POSTGRES_PASSWORD=disposable-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not start' }
try {
  for ($i = 0; $i -lt 30; $i++) {
    docker exec repair-2a-verify pg_isready -U inspection_app -d phase6_seed_integration
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL unavailable' }
  $env:NODE_ENV = 'test'
  $env:SEED_INTEGRATION_DATABASE_URL = 'postgres://inspection_app:disposable-only@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
  foreach ($file in @(
    'src/jobs/offlineServiceVisits.integration.test.ts',
    'src/jobs/serviceVisits.integration.test.ts',
    'src/routes/technicianOwnership.integration.test.ts',
    'src/sync/fireAlarmV6Acceptance.integration.test.ts',
    'src/sync/co2V7.integration.test.ts',
    'src/sync/wetChemicalV7.integration.test.ts',
    'src/sync/fireAlarmV7.integration.test.ts',
    'src/sync/v7EvidenceRace.integration.test.ts'
  )) {
    # Separate processes: each suite can close its shared pool.
    Gate $file { node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file }
  }
} finally { docker rm -f repair-2a-verify }

Set-Location C:\PWA_OfflineRecordWebApp\apps\web
Gate 'Web typecheck' { npm run typecheck }
Gate 'Web build' { npm run build }
Gate 'Web V7 stale evidence' { npm run test:v7-stale-evidence }
Set-Location C:\PWA_OfflineRecordWebApp
Gate 'Diff whitespace' { git diff --check }
git status --short
Write-Output "FAILED GATES: $($failures -join ', ')"
if ($failures.Count -gt 0) { exit 1 }

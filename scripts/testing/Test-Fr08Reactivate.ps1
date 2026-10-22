# FR-08 + standard cold-DB gates. Creates only its own disposable PostgreSQL.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$saved = @{}
foreach ($key in @('NODE_ENV', 'DATABASE_URL', 'SEED_INTEGRATION_DATABASE_URL', 'REPORT_CHROMIUM_PATH')) {
  $saved[$key] = [Environment]::GetEnvironmentVariable($key)
}
$containerId = $null
Push-Location $repo
try {
  if ([string]::IsNullOrWhiteSpace($env:REPORT_CHROMIUM_PATH)) {
    Push-Location apps/web
    try { $env:REPORT_CHROMIUM_PATH = (node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim() }
    finally { Pop-Location }
  }
  if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Set REPORT_CHROMIUM_PATH to an installed Chromium executable.' }
  $containerName = 'fr08-reactivate-' + [guid]::NewGuid().ToString('N')
  # Old test processes using the shared placeholder cannot reconnect to this run.
  $databasePassword = 'fr08-' + [guid]::NewGuid().ToString('N')
  $containerId = docker create --name $containerName -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app `
    -e POSTGRES_PASSWORD=$databasePassword -p 127.0.0.1:55432:5432 postgres:16-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL could not be created' }
  docker start $containerId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Port 55432 may be occupied. No existing container was stopped.' }
  $ready = $false
  for ($attempt = 0; $attempt -lt 90 -and !$ready; $attempt++) {
    $ErrorActionPreference = 'Continue'
    docker exec $containerId psql -h 127.0.0.1 -U inspection_app -d phase6_seed_integration -tAc 'SELECT 1' 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep -Seconds 1 }
  }
  if (!$ready) { throw 'Disposable PostgreSQL did not become ready' }
  $env:NODE_ENV = 'test'
  $env:SEED_INTEGRATION_DATABASE_URL = "postgres://inspection_app:$databasePassword@127.0.0.1:55432/phase6_seed_integration"
  $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
  Set-Location apps/api
  foreach ($file in @(
    'src/routes/managerTechniciansReactivate.integration.test.ts',
    'src/routes/managerTechnicians.test.ts',
    'src/routes/managerTechnicians.integration.test.ts',
    'src/routes/managerTechnicianVisits.integration.test.ts',
    'src/sync/fireAlarmV6Acceptance.integration.test.ts',
    'src/sync/co2V7.integration.test.ts',
    'src/sync/wetChemicalV7.integration.test.ts',
    'src/sync/fireAlarmV7.integration.test.ts',
    'src/sync/v7EvidenceRace.integration.test.ts'
  )) {
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file
    if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
  }
} finally {
  if ($containerId) { docker rm -f $containerId | Out-Null }
  foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key]) }
  Pop-Location
}

<#
.SYNOPSIS
  Standard API test gate: every apps/api/src/**/*.test.ts, one process per file,
  against a cold disposable PostgreSQL on 127.0.0.1:55432.

.DESCRIPTION
  Creates its own postgres:16-alpine container (random name), creates the extra
  databases that two suites require by name, runs each test file in its own node
  process, prints pass/fail/skip per file and totals, and removes the container in
  finally. Never stops another run's database or touches the Compose database; if
  port 55432 is occupied it fails instead.

  Per-file databases (the tests assert these names):
    src/routes/customerVisitSummaries.test.ts
        VISIT_SUMMARIES_TEST_DATABASE_URL -> visit_summaries_test
    src/routes/managerCustomerDetails.integration.test.ts
        SEED_INTEGRATION_DATABASE_URL     -> customer_records_s3a_test
  Every other file uses phase6_seed_integration (SEED_INTEGRATION_DATABASE_URL = DATABASE_URL).

  No Git mutations.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$apiDir = Join-Path $repo 'apps/api'
$password = 'replace-with-a-real-secret-outside-git'
$base = "postgres://inspection_app:$password@127.0.0.1:55432"
$mainDb = 'phase6_seed_integration'
$extraDatabases = @('visit_summaries_test', 'customer_records_s3a_test')
$perFileEnv = @{
  'src/routes/customerVisitSummaries.test.ts' = @{ VISIT_SUMMARIES_TEST_DATABASE_URL = "$base/visit_summaries_test" }
  'src/routes/managerCustomerDetails.integration.test.ts' = @{ SEED_INTEGRATION_DATABASE_URL = "$base/customer_records_s3a_test" }
}
$saved = @{}
foreach ($name in 'REPORT_CHROMIUM_PATH', 'NODE_ENV', 'DATABASE_URL', 'SEED_INTEGRATION_DATABASE_URL', 'VISIT_SUMMARIES_TEST_DATABASE_URL') {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}
# PDF/report suites need a real Chromium; use the one Playwright already installed for apps/web.
Push-Location (Join-Path $repo 'apps/web'); try { $chromium = (node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))" | Out-String).Trim() } finally { Pop-Location }
if (-not (Test-Path -LiteralPath $chromium)) { throw 'Playwright Chromium is unavailable' }
$container = 'api-gate-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$containerId = docker create --name $container -e POSTGRES_DB=$mainDb -e POSTGRES_USER=inspection_app `
  -e POSTGRES_PASSWORD=$password -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL could not be created' }
$results = @()
try {
  docker start $containerId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not start; port 55432 may be occupied. No existing container was stopped.' }
  # pg_isready also answers during the image's temporary init server, which then shuts down; only the
  # final server listens on TCP, so readiness is a real query over TCP.
  $ready = $false
  for ($i = 0; $i -lt 90 -and -not $ready; $i++) {
    $ErrorActionPreference = 'Continue'
    docker exec $containerId psql -h 127.0.0.1 -U inspection_app -d $mainDb -tAc 'SELECT 1' 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { throw 'Disposable PostgreSQL did not become ready' }
  foreach ($database in $extraDatabases) {
    docker exec $containerId psql -h 127.0.0.1 -U inspection_app -d $mainDb -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create database $database" }
  }
  $env:REPORT_CHROMIUM_PATH = $chromium
  $env:NODE_ENV = 'test'
  $env:SEED_INTEGRATION_DATABASE_URL = "$base/$mainDb"
  $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
  Remove-Item Env:VISIT_SUMMARIES_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Push-Location $apiDir
  try {
    $files = Get-ChildItem -Path 'src' -Recurse -Filter '*.test.ts' | Sort-Object FullName
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($apiDir.Length + 1).Replace('\', '/')
      $override = $perFileEnv[$relative]
      $previous = @{}
      if ($override) { foreach ($key in $override.Keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key); [Environment]::SetEnvironmentVariable($key, $override[$key]) } }
      try { $output = node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $relative 2>&1 | Out-String; $code = $LASTEXITCODE }
      finally { foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key]) } }
      $count = { param($label) if ($output -match "(?m)^\S+ $label (\d+)\s*$") { [int]$Matches[1] } else { 0 } }
      $row = [pscustomobject]@{ File = $relative; Exit = $code; Pass = & $count 'pass'; Fail = & $count 'fail'; Skipped = & $count 'skipped' }
      $results += $row
      '{0,-4} pass {1,-4} fail {2,-3} skip {3,-3} {4}' -f $(if ($code -eq 0) { 'ok' } else { 'FAIL' }), $row.Pass, $row.Fail, $row.Skipped, $relative
      if ($code -ne 0) { $output }
    }
  } finally { Pop-Location }
} finally {
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
  Set-Location $repo
  docker rm -f $containerId | Out-Null
}
$failedFiles = @($results | Where-Object { $_.Exit -ne 0 })
'API gate: {0} files, {1} tests passed, {2} failed, {3} skipped, {4} failing files' -f $results.Count,
  ($results | Measure-Object Pass -Sum).Sum, ($results | Measure-Object Fail -Sum).Sum, ($results | Measure-Object Skipped -Sum).Sum, $failedFiles.Count
if ($failedFiles.Count -gt 0) { exit 1 }

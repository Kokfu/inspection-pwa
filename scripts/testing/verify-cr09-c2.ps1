# CR-09 C2 cold, disposable-only verification. No runtime migration or deployment.
param([switch]$FocusedOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'C:\PWA_OfflineRecordWebApp'
$repoRoot = (Get-Location).Path
$testContainer = 'cr09-c2-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$gateLog = Join-Path $repoRoot $(if ($FocusedOnly) { 'logs\cr09-c2-focused.log' } else { 'logs\cr09-c2-gates.log' })
New-Item -ItemType Directory -Path (Split-Path $gateLog) -Force | Out-Null
Set-Content -LiteralPath $gateLog -Value 'CR-09 C2 cold gates'
$savedDatabase = $env:DATABASE_URL
$savedSeedDatabase = $env:SEED_INTEGRATION_DATABASE_URL
$savedNodeEnvironment = $env:NODE_ENV
$savedChromium = $env:REPORT_CHROMIUM_PATH
$savedUploads = $env:UPLOADS_PATH
$failedGates = [System.Collections.Generic.List[string]]::new()
function Invoke-Gate([string]$name, [scriptblock]$run) {
  Add-Content -LiteralPath $gateLog -Value "`nGATE: $name"
  $result = & $run 2>&1
  $gateExit = $LASTEXITCODE
  $result | Tee-Object -FilePath $gateLog -Append | Write-Output
  if ($gateExit -ne 0 -or ($result -join "`n") -match '(skipped\s+[1-9]\d*|[1-9]\d*\s+skipped)') {
    $failedGates.Add($name)
    Add-Content -LiteralPath $gateLog -Value "FAIL: $name"
  } else { Add-Content -LiteralPath $gateLog -Value "PASS: $name" }
}
try {
  docker run -d --rm --name $testContainer -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app `
    -e POSTGRES_PASSWORD=replace-with-a-real-secret-outside-git -p 127.0.0.1:55432:5432 postgres:16-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Fresh disposable PostgreSQL did not start. Do not use another database.' }
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $testContainer pg_isready -U inspection_app -d phase6_seed_integration
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL was not ready' }
  $env:NODE_ENV='test'
  $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL=$env:SEED_INTEGRATION_DATABASE_URL
  $targetUri=[Uri]$env:DATABASE_URL
  if ($targetUri.Host -ne '127.0.0.1' -or $targetUri.Port -ne 55432) { throw 'Unsafe database target' }
  # All persistent test attachments are in disposable suite directories, never runtime uploads.
  $env:UPLOADS_PATH=Join-Path ([System.IO.Path]::GetTempPath()) $testContainer
  Set-Location -LiteralPath (Join-Path $repoRoot 'apps\web')
  $env:REPORT_CHROMIUM_PATH=(node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Playwright Chromium is unavailable' }
  Add-Content -LiteralPath $gateLog -Value 'PASS: Chromium available'
  Set-Location -LiteralPath (Join-Path $repoRoot 'apps\api')
  Invoke-Gate 'API typecheck' { npm.cmd run typecheck }
  Invoke-Gate 'API build' { npm.cmd run build }
  if (!$FocusedOnly) {
  Invoke-Gate 'historical matrix' { npm.cmd run test:historical-matrix }
  Invoke-Gate 'V6 evidence' { npm.cmd run test:v6-evidence }
  Invoke-Gate 'Wet Chemical definition' { npm.cmd run test:wet-chemical-definition }
  Invoke-Gate 'V7 contracts and config' { node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts }
  }
  Invoke-Gate 'B1 readers' { node --import tsx --test src/repairs/findingReaders.test.ts src/repairs/historicalFindingReaders.test.ts }
  Invoke-Gate 'B1 integration' { node --import tsx --test src/repairs/repairFoundation.integration.test.ts }
  Invoke-Gate 'B2 integration' { node --import tsx --test src/repairs/repairSubmission.integration.test.ts }
  Invoke-Gate 'storage reconciliation' { node --import tsx --test src/attachments/attachmentStorageReconciliation.integration.test.ts }
  if (!$FocusedOnly) {
  Invoke-Gate 'V6 integration' { npm.cmd run test:v6-integration }
  foreach ($suite in @('co2V7', 'wetChemicalV7', 'fireAlarmV7', 'v7EvidenceRace', 'optionalGoodPhoto')) {
    $testFile="src/sync/$suite.integration.test.ts"
    Invoke-Gate $suite { node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $testFile }
  }
  Set-Location -LiteralPath (Join-Path $repoRoot 'apps\web')
  # Vite must bundle production React. NODE_ENV=test was only for API fixtures.
  $env:NODE_ENV='production'
  Invoke-Gate 'web typecheck' { npm.cmd run typecheck }
  Invoke-Gate 'web build' { npm.cmd run build }
  Invoke-Gate 'PWA build contract' { node --test tests/pwa-build-contract.test.mjs }
  Invoke-Gate 'web stale evidence' { npm.cmd run test:v7-stale-evidence }
  $env:NODE_ENV='test'
  Invoke-Gate 'C2 C1 B3 browser plus inspection and Manager regressions' { npx.cmd playwright test tests/repair-c2.spec.ts tests/repair-c1.spec.ts tests/repair-b3.spec.ts tests/fire-alarm-client-dispatch.spec.ts tests/co2-v7-cross-instance.spec.ts tests/sync-refusal-engine.spec.ts tests/manager-dashboard-navigation.spec.ts tests/manager-app-auth-transitions.spec.ts tests/manager-report-approval.spec.ts tests/manager-final-report-navigation.spec.ts tests/manager-final-report-failure-matrix.spec.ts --workers=1 }
  # Exercise the original default-mode fixtures, including every retired draft's
  # offline edit and persisted result. Healthy-online smoke is separate proof.
  Invoke-Gate 'Phase A default entry and offline retired-draft compatibility' { npx.cmd playwright test tests/repair-disabled.spec.ts --workers=1 }
  Invoke-Gate 'Phase A current-entry and accepted-display regressions' { npx.cmd playwright test tests/repair-c1-inspection-regressions.spec.ts --grep 'new form has no Complete Repair choice|accepted view and final report retain Complete Repair|Roller Shutter retired draft can change' --workers=1 }
  Invoke-Gate 'inspection auto-sync and queued-write guards' { npm.cmd run test:auto-sync; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm.cmd run test:queued-write-refusal }
  }
  Set-Location -LiteralPath $repoRoot
  Invoke-Gate 'diff whitespace' { git diff --check }
  git status --short | Tee-Object -FilePath $gateLog -Append | Write-Output
  if ($failedGates.Count) { throw ('Failed gates: ' + ($failedGates -join ', ')) }
  Add-Content -LiteralPath $gateLog -Value 'ALL GATES PASS'
} finally {
  Set-Location -LiteralPath $repoRoot
  # Exact unique test container only; never Compose or its volumes.
  docker rm -f $testContainer
  $env:DATABASE_URL=$savedDatabase
  $env:SEED_INTEGRATION_DATABASE_URL=$savedSeedDatabase
  $env:NODE_ENV=$savedNodeEnvironment
  $env:REPORT_CHROMIUM_PATH=$savedChromium
  $env:UPLOADS_PATH=$savedUploads
}


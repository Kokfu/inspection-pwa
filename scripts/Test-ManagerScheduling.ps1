$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$container = 'manager-scheduling-verify-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$started = $false
$savedEnvironment = @{}
foreach ($name in @('NODE_ENV', 'DATABASE_URL', 'SEED_INTEGRATION_DATABASE_URL')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
function Invoke-Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Verification failed (exit $LASTEXITCODE): $Command" }
}
Push-Location $repo
try {
    # An occupied port fails safely. Never reuse, reset, or remove another container.
    Invoke-Checked { docker run -d --rm --name $container -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=disposable-test-only -p 127.0.0.1:55432:5432 postgres:16-alpine }
    $started = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        docker exec $container pg_isready -U inspection_app -d phase6_seed_integration *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Disposable PostgreSQL did not become ready.' }
    $env:NODE_ENV = 'test'
    $env:DATABASE_URL = 'postgres://bogus:bogus@10.255.255.1:9999/nope'
    $env:SEED_INTEGRATION_DATABASE_URL = 'postgres://inspection_app:disposable-test-only@127.0.0.1:55432/phase6_seed_integration'
    Set-Location (Join-Path $repo 'apps/api')
    Invoke-Checked { npm run typecheck }
    Invoke-Checked { npm run build }
    Invoke-Checked { npm run test:historical-matrix }
    Invoke-Checked { npm run test:v6-evidence }
    Invoke-Checked { npm run test:wet-chemical-definition }
    Invoke-Checked { node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts }
    Invoke-Checked { node --import tsx --test --test-concurrency=1 src/routes/managerTechnicians.test.ts src/routes/managerCustomers.test.ts src/routes/managerTechnicians.integration.test.ts src/routes/managerCustomers.integration.test.ts src/jobs/serviceVisits.test.ts src/jobs/serviceVisits.integration.test.ts src/routes/customerCreation.integration.test.ts src/reports/finalServiceReport.test.ts src/routes/managerLocations.integration.test.ts }
    Invoke-Checked { node --import tsx --test --test-concurrency=1 src/sync/fireAlarmV6Acceptance.integration.test.ts src/sync/co2V7.integration.test.ts src/sync/wetChemicalV7.integration.test.ts src/sync/fireAlarmV7.integration.test.ts src/sync/v7EvidenceRace.integration.test.ts }
    Set-Location (Join-Path $repo 'apps/web')
    Invoke-Checked { npm run typecheck }
    Invoke-Checked { npm run build }
    Invoke-Checked { npm run test:v7-stale-evidence }
    Invoke-Checked { npm run test:job-progress }
    Invoke-Checked { npx playwright test tests/manager-technicians.spec.ts tests/manager-dashboard-navigation.spec.ts tests/manager-upcoming-services.spec.ts tests/manager-app-auth-transitions.spec.ts tests/manager-navigation-request-count.spec.ts tests/manager-created-time.spec.ts tests/manager-final-report-navigation.spec.ts tests/new-service-visit-schedule.spec.ts --workers=1 }
    Set-Location $repo
    Invoke-Checked { git diff --check }
    $protected = @('apps/api/src/inspections/templates/masterServiceReportV[1-6].ts', 'apps/api/migrations/017*', 'apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts', 'apps/api/src/sync/fireAlarmV6Acceptance.ts', 'apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts')
    Invoke-Checked { git diff --exit-code e30c649 -- $protected }
    Invoke-Checked { git status --short }
    Write-Output 'PASS: Manager scheduling automated gates; no Git mutations performed.'
} finally {
    if ($started) { docker rm -f $container | Out-Null }
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    Pop-Location
}

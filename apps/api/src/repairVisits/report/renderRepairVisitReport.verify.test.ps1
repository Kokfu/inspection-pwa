$ErrorActionPreference = 'Stop'
Set-Location C:\PWA_OfflineRecordWebApp
$root = (Get-Location).Path
$savedEnvironment = @{}
foreach ($key in @('NODE_ENV', 'DATABASE_URL', 'SEED_INTEGRATION_DATABASE_URL', 'REPORT_CHROMIUM_PATH', 'PLAYWRIGHT_BROWSERS_PATH')) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key)
}
$containerName = 'repair-2c-verify-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$started = $false
function Check-Exit([string]$gate) {
    if ($LASTEXITCODE -ne 0) { throw "$gate failed (exit $LASTEXITCODE)" }
}
try {
    # Resolve the installed Playwright browser, independent of sandbox LOCALAPPDATA.
    $env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\kokfu\AppData\Local\ms-playwright'
    Set-Location "$root\apps\web"
    $env:REPORT_CHROMIUM_PATH = (node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
    if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Chromium is unavailable' }
    npm run typecheck
    Check-Exit 'Web typecheck'
    npm run build
    Check-Exit 'Web build'
    Set-Location "$root\apps\api"
    npm run typecheck
    Check-Exit 'API typecheck'
    npm run build
    Check-Exit 'API build'
    $unitFiles = @(
        'src/repairVisits/report/renderRepairVisitReport.test.ts',
        'src/reports/template/renderReportHtml.test.ts',
        'src/inspections/templates/historicalCompatibilityMatrix.test.ts',
        'src/inspections/dryWetRiserAccepted.test.ts',
        'src/inspections/templates/portableFireExtinguisherDefinition.test.ts',
        'src/attachments/attachmentStorage.test.ts',
        'src/inspections/evidence/fireAlarmV6Evidence.test.ts',
        'src/inspections/templates/systemContractCompatibility.test.ts',
        'src/inspections/templates/wetChemicalDefinitionControls.test.ts',
        'src/inspections/evidence/v7EvidenceContracts.test.ts',
        'src/config/env.test.ts',
        '../web/tests/v7EvidenceStaleManifest.test.ts'
    )
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test @unitFiles
    Check-Exit 'Renderer, unchanged service snapshot, historical, V6, V7, configuration and stale evidence tests'

    # New container + new empty database; port collision fails without touching its owner.
    $password = [guid]::NewGuid().ToString('N')
    docker run -d --rm --name $containerName -e POSTGRES_DB=repair_pdf_verify -e POSTGRES_USER=inspection_app -e "POSTGRES_PASSWORD=$password" -p 127.0.0.1:55432:5432 postgres:16-alpine
    Check-Exit 'Fresh disposable PostgreSQL startup (requires unused port 55432)'
    $started = $true
    for ($i = 0; $i -lt 30; $i++) {
        docker exec $containerName pg_isready -U inspection_app -d repair_pdf_verify
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    }
    Check-Exit 'Disposable PostgreSQL readiness'
    $env:NODE_ENV = 'test'
    $env:SEED_INTEGRATION_DATABASE_URL = "postgres://inspection_app:$password@127.0.0.1:55432/repair_pdf_verify"
    $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
    foreach ($file in @('fireAlarmV6Acceptance', 'co2V7', 'wetChemicalV7', 'fireAlarmV7', 'v7EvidenceRace')) {
        node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test "src/sync/$file.integration.test.ts"
        Check-Exit $file
    }
    Set-Location $root
    git diff --check
    Check-Exit 'Whitespace check'
    git status --short
} finally {
    if ($started) { docker rm -f $containerName }
    foreach ($key in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key])
    }
    Set-Location $root
}

<#
.SYNOPSIS
  Live browser gate for the CO2 and Wet Chemical V7 accepted-detail specs.

.DESCRIPTION
  Starts a disposable postgres:16-alpine on 127.0.0.1:55432, seeds each live fixture
  with its integration test (SEED=1), starts the real API + Vite dev server behind
  apps/web/tests/liveReverseProxy.mjs (one origin for the app and /api), and runs the
  matching live Playwright spec with PLAYWRIGHT_LIVE=1.

  Each integration test drops and recreates the public schema, so the phases run
  strictly in order: seed CO2 -> spec CO2 -> seed Wet Chemical -> spec Wet Chemical.
  The API is stopped before each seed and started fresh after it.

  Everything it creates (container, child processes, temp fixture/upload directory,
  environment variables) is removed or restored in finally. No Git mutations.

.PARAMETER RevertProofBogusPhoto
  Negative control only: runs the CO2 spec against a scratch copy of its fixture with
  photoA replaced by a random UUID. The run must then exit non-zero.
#>
param([switch]$RevertProofBogusPhoto)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repo 'apps/api'
$webDir = Join-Path $repo 'apps/web'
$container = 'v7-live-browser-verify-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$workDir = Join-Path ([IO.Path]::GetTempPath()) ('v7-live-browser-' + [guid]::NewGuid().ToString('N'))
$databaseUrl = 'postgres://inspection_app:disposable-test-only@127.0.0.1:55432/phase6_seed_integration'
$apiPort = 4180; $webPort = 4177; $proxyPort = 4176
# Live mode skips the playwright.config.ts webServer (4175); the proxy serves the app.
$requiredPorts = @(55432, $proxyPort, $webPort, $apiPort)
$baseUrl = "http://127.0.0.1:$proxyPort"
$started = $false
$specFailures = New-Object System.Collections.ArrayList
$children = New-Object System.Collections.ArrayList
$managedEnvironment = @('NODE_ENV', 'DATABASE_URL', 'SEED_INTEGRATION_DATABASE_URL', 'UPLOADS_PATH', 'API_PORT', 'REPORT_CHROMIUM_PATH',
    'LIVE_WEB_ORIGIN', 'LIVE_API_ORIGIN', 'LIVE_PROXY_PORT', 'PLAYWRIGHT_LIVE', 'PLAYWRIGHT_JSON_OUTPUT_NAME',
    'CO2_V7_LIVE_BROWSER_SEED', 'CO2_V7_LIVE_BROWSER_FIXTURE_PATH', 'CO2_V7_LIVE_BROWSER_BASE_URL',
    'WET_CHEMICAL_V7_LIVE_BROWSER_SEED', 'WET_CHEMICAL_V7_LIVE_BROWSER_FIXTURE_PATH', 'WET_CHEMICAL_V7_LIVE_BROWSER_BASE_URL')
$savedEnvironment = @{}
foreach ($name in $managedEnvironment) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

# PS 5.1: when this script's output is redirected (e.g. `*>&1`), every stderr line of a native
# command becomes an ErrorRecord, and under the script-wide 'Stop' the first one (node's NO_COLOR
# warning) aborts a green run. Native calls therefore run with a function-local 'Continue';
# $LASTEXITCODE (and the Playwright JSON stats) stay the only pass/fail authority.
function Invoke-Native([scriptblock]$Command) {
    $ErrorActionPreference = 'Continue'
    & $Command
}

function Invoke-Checked([scriptblock]$Command) {
    Invoke-Native $Command
    if ($LASTEXITCODE -ne 0) { throw "Verification failed (exit $LASTEXITCODE): $Command" }
}

function Assert-PortsFree {
    foreach ($port in $requiredPorts) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        if ($listener) { throw "Port $port is already in use (PID $(@($listener)[0].OwningProcess)). Refusing to reuse or stop another process." }
    }
}

function Start-Child([string]$Name, [string]$WorkingDirectory, [string]$Arguments) {
    $process = Start-Process -FilePath 'node' -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $workDir "$Name.out.log") -RedirectStandardError (Join-Path $workDir "$Name.err.log")
    [void]$children.Add([pscustomobject]@{ Name = $Name; Process = $process })
    Write-Output "Started $Name (PID $($process.Id))"
}

function Stop-Children {
    foreach ($child in @($children)) {
        if (!$child.Process.HasExited) { & cmd.exe /c "taskkill /PID $($child.Process.Id) /T /F >nul 2>&1" }
        $child.Process.WaitForExit(10000) | Out-Null
    }
    $children.Clear()
}

function Show-ChildLogs {
    foreach ($log in @(Get-ChildItem -Path $workDir -Filter '*.log' -ErrorAction SilentlyContinue)) {
        Write-Output "----- $($log.Name) (tail) -----"
        Get-Content -LiteralPath $log.FullName -Tail 30 -ErrorAction SilentlyContinue
    }
}

function Wait-Http([string]$Url, [int]$Seconds = 90) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        foreach ($child in @($children)) { if ($child.Process.HasExited) { Show-ChildLogs; throw "$($child.Name) exited (code $($child.Process.ExitCode)) while waiting for $Url" } }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { Write-Output "Ready: $Url"; return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    Show-ChildLogs
    throw "Timed out waiting for $Url"
}

function Start-LiveStack {
    $env:API_PORT = "$apiPort"
    Start-Child 'api' $apiDir '--import tsx src/server.ts'
    Start-Child 'web' $webDir "node_modules/vite/bin/vite.js --host 127.0.0.1 --port $webPort --strictPort"
    $env:LIVE_WEB_ORIGIN = "http://127.0.0.1:$webPort"; $env:LIVE_API_ORIGIN = "http://127.0.0.1:$apiPort"; $env:LIVE_PROXY_PORT = "$proxyPort"
    Start-Child 'proxy' $webDir 'tests/liveReverseProxy.mjs'
    Wait-Http "http://127.0.0.1:$apiPort/health"
    Wait-Http "$baseUrl/api/health"
    Wait-Http "$baseUrl/"
}

function Read-Fixture([string]$Path) {
    if (!(Test-Path -LiteralPath $Path)) { throw "Fixture was not written: $Path" }
    $fixture = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    foreach ($key in @('clientUuid', 'jobReference', 'username', 'password', 'foreignUsername', 'foreignPassword', 'photoA', 'photoB')) {
        $value = $fixture.PSObject.Properties[$key]
        if (!$value -or [string]::IsNullOrWhiteSpace([string]$value.Value)) { throw "Fixture $Path is missing '$key'" }
    }
    if ($fixture.photoA -eq $fixture.photoB) { throw "Fixture $Path has identical photoA/photoB" }
    Write-Host "Fixture OK: $Path (clientUuid $($fixture.clientUuid))"
    return $fixture
}

function Invoke-LiveSpec([string]$Spec, [string]$Label) {
    $report = Join-Path $workDir "$Label.playwright.json"
    $env:PLAYWRIGHT_LIVE = '1'
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = $report
    Set-Location $webDir
    $global:LASTEXITCODE = -1
    Invoke-Native { npx playwright test $Spec --workers=1 --retries=0 --forbid-only --reporter=list,json }
    $exitCode = $LASTEXITCODE
    if (!(Test-Path -LiteralPath $report)) { throw "$Label spec produced no JSON report (exit $exitCode)" }
    $stats = (Get-Content -LiteralPath $report -Raw | ConvertFrom-Json).stats
    Write-Output "$Label live spec: expected=$($stats.expected) unexpected=$($stats.unexpected) skipped=$($stats.skipped) flaky=$($stats.flaky)"
    if ($exitCode -ne 0 -or $stats.expected -ne 1 -or $stats.unexpected -ne 0 -or $stats.skipped -ne 0 -or $stats.flaky -ne 0) {
        # Recorded, not thrown, so the next phase still runs; the gate fails at the end.
        [void]$specFailures.Add("$Label live spec failed (exit $exitCode)")
    }
}

function Invoke-LivePhase([string]$Label, [string]$Prefix, [string]$SeedTest, [string]$SeedPattern, [string]$Spec) {
    Write-Output "===== ${Label}: seed ====="
    Stop-Children
    $fixturePath = Join-Path $workDir "$Label.fixture.json"
    Set-Item "env:${Prefix}_SEED" '1'
    Set-Item "env:${Prefix}_FIXTURE_PATH" $fixturePath
    Set-Location $apiDir
    # Only the seeding test runs: the file's second test drops the schema again.
    # The seeding test renders a PDF; like the api test:*-integration scripts, load the PDF
    # engine lifecycle hook (when present) so the Chromium engine closes and node exits.
    $imports = @('--import', 'tsx')
    if (Test-Path -LiteralPath (Join-Path $apiDir 'src/reports/pdf/testLifecycle.ts')) { $imports += @('--import', './src/reports/pdf/testLifecycle.ts') }
    Invoke-Checked { node @imports --test --test-concurrency=1 --test-name-pattern $SeedPattern $SeedTest }
    Remove-Item "env:${Prefix}_SEED"
    $fixture = Read-Fixture $fixturePath
    if ($RevertProofBogusPhoto -and $Label -eq 'co2') {
        $scratch = Join-Path $workDir "$Label.bogus-photo.fixture.json"
        $fixture.photoA = [guid]::NewGuid().ToString()
        $fixture | ConvertTo-Json -Compress | Set-Content -LiteralPath $scratch -Encoding ascii
        Set-Item "env:${Prefix}_FIXTURE_PATH" $scratch
        Write-Output "REVERT PROOF: CO2 spec uses scratch fixture with bogus photoA $($fixture.photoA)"
    }
    Set-Item "env:${Prefix}_BASE_URL" $baseUrl
    Write-Output "===== ${Label}: live spec ====="
    Start-LiveStack
    Invoke-LiveSpec $Spec $Label
    Stop-Children
}

Push-Location $repo
try {
    Assert-PortsFree
    New-Item -ItemType Directory -Path $workDir | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $workDir 'uploads') | Out-Null
    Invoke-Checked { docker run -d --rm --name $container -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=disposable-test-only -p 127.0.0.1:55432:5432 postgres:16-alpine }
    $started = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & cmd.exe /c "docker exec $container pg_isready -U inspection_app -d phase6_seed_integration >nul 2>&1"
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Disposable PostgreSQL did not become ready.' }

    $env:NODE_ENV = 'test'
    $env:DATABASE_URL = $databaseUrl
    $env:SEED_INTEGRATION_DATABASE_URL = $databaseUrl
    $env:UPLOADS_PATH = Join-Path $workDir 'uploads'
    if ([string]::IsNullOrWhiteSpace($env:REPORT_CHROMIUM_PATH)) {
        # The seeding tests render the final-report PDF (HTML renderer), which needs a Chromium binary.
        Set-Location $webDir
        $env:REPORT_CHROMIUM_PATH = ([string](Invoke-Native { node -e "import('@playwright/test').then((m) => console.log(m.chromium.executablePath()))" })).Trim()
        if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw "Playwright Chromium not found at $($env:REPORT_CHROMIUM_PATH)" }
    }

    Invoke-LivePhase 'co2' 'CO2_V7_LIVE_BROWSER' 'src/sync/co2V7.integration.test.ts' '^CO2 V7 stages distinct multipart evidence' 'tests/co2-v7-live-accepted-detail.spec.ts'
    Invoke-LivePhase 'wet-chemical' 'WET_CHEMICAL_V7_LIVE_BROWSER' 'src/sync/wetChemicalV7.integration.test.ts' '^Wet Chemical V7 uses the shared staged-evidence authority' 'tests/wet-chemical-v7-live-accepted-detail.spec.ts'

    if ($specFailures.Count) { throw "FAIL: $($specFailures -join '; ')" }
    Write-Output 'PASS: V7 live browser gate (CO2 + Wet Chemical accepted detail); no Git mutations performed.'
} finally {
    Stop-Children
    if ($started) { & cmd.exe /c "docker rm -f $container >nul 2>&1" }
    for ($attempt = 0; $attempt -lt 5 -and (Test-Path -LiteralPath $workDir); $attempt++) {
        Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $workDir) { Start-Sleep -Seconds 1 }
    }
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    Pop-Location
}

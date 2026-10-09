# Run from Windows PowerShell with Node, Docker Desktop and installed Playwright Chromium.
# Starts ONLY a fresh disposable database. Never reads an inherited database URL.
param([switch]$IntegrationOnly, [switch]$SecurityOnly)
$ErrorActionPreference = 'Stop'
if ($IntegrationOnly -and $SecurityOnly) { throw 'Choose IntegrationOnly or SecurityOnly, not both' }
$repo = 'C:\PWA_OfflineRecordWebApp'
$container = 'security-verify-' + [guid]::NewGuid().ToString('N')
$previous = @{}
foreach($key in @('NODE_ENV','DATABASE_URL','SEED_INTEGRATION_DATABASE_URL','REPORT_CHROMIUM_PATH')) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
function Check([string]$label) { if($LASTEXITCODE -ne 0) { throw "Failed: $label" } }
Set-Location $repo
try {
  $testPassword=[guid]::NewGuid().ToString('N')
  docker run -d --rm --name $container -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e "POSTGRES_PASSWORD=$testPassword" -p 127.0.0.1:55432:5432 postgres:16-alpine
  Check 'disposable database start (port must be free)'
  $ready=$false
  for($i=0;$i -lt 30;$i++) { docker exec $container pg_isready -U inspection_app -d phase6_seed_integration; if($LASTEXITCODE -eq 0){$ready=$true;break}; Start-Sleep -Seconds 1 }
  if(!$ready){throw 'Disposable database not ready'}
  $env:NODE_ENV='test'
  $env:SEED_INTEGRATION_DATABASE_URL="postgres://inspection_app:$testPassword@127.0.0.1:55432/phase6_seed_integration"
  $env:DATABASE_URL=$env:SEED_INTEGRATION_DATABASE_URL
  Set-Location "$repo\apps\web"
  $env:REPORT_CHROMIUM_PATH=(node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
  Check 'Chromium path'
  if(!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)){throw 'Install Playwright Chromium before verification'}
  Set-Location "$repo\apps\api"
  if(!$IntegrationOnly -and !$SecurityOnly) {
    npm.cmd run typecheck; Check 'API typecheck'
    npm.cmd run build; Check 'API build'
    npm.cmd audit; Check 'API full dependency audit'
    npm.cmd audit --omit=dev; Check 'API production dependency audit'
    npm.cmd run test:historical-matrix; Check 'historical matrix'
    npm.cmd run test:v6-evidence; Check 'V6 evidence'
    npm.cmd run test:wet-chemical-definition; Check 'Wet Chemical definition'
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test src/auth/loginSecurity.test.ts src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts src/reports/companyProfile.test.ts src/reports/finalServiceReport.test.ts src/reports/template/renderReportHtml.test.ts
    Check 'API unit/image/PDF regressions'
  }
  $integrationFiles = if ($SecurityOnly) { @('src/routes/authSecurity.integration.test.ts') } else { @('src/routes/authSecurity.integration.test.ts','src/routes/technicianOwnership.integration.test.ts','src/routes/supervisorRole.integration.test.ts','src/routes/managerTechnicians.integration.test.ts','src/sync/fireAlarmV6Acceptance.integration.test.ts','src/sync/co2V7.integration.test.ts','src/sync/wetChemicalV7.integration.test.ts','src/sync/fireAlarmV7.integration.test.ts','src/sync/v7EvidenceRace.integration.test.ts','src/reports/finalServiceReport.integration.test.ts','src/reports/fireAlarmV6FinalReport.integration.test.ts') }
  foreach($file in $integrationFiles) {
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file
    Check $file
  }
  if(!$IntegrationOnly -and !$SecurityOnly) {
    Set-Location "$repo\apps\web"
    npm.cmd run typecheck; Check 'web typecheck'
    npm.cmd run build; Check 'web build'
    npm.cmd audit; Check 'web full dependency audit'
    npm.cmd audit --omit=dev; Check 'web production dependency audit'
    ..\api\node_modules\.bin\tsx.cmd --test tests/roleAccess.test.ts tests/authorityOfflineFallback.test.ts tests/auth-restoration-regression.test.ts tests/authProbeGateway.test.ts tests/manager-auth-lifecycle.test.ts tests/v7EvidenceStaleManifest.test.ts
    Check 'web authority/offline regressions'
    npx.cmd playwright test tests/login-cooldown.spec.ts tests/manager-app-auth-transitions.spec.ts --workers=1
    Check 'browser cooldown and authority lifecycle'
    Set-Location $repo
    node scripts/check-security-headers.mjs --static-only; Check 'static security headers'
    git diff --check; Check 'diff whitespace'
    git status --short
  }
} finally {
  Set-Location $repo
  docker rm -f $container
  foreach($key in $previous.Keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
}

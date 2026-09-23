$ErrorActionPreference = 'Stop'
Set-Location C:\PWA_OfflineRecordWebApp
$env:REPORT_CHROMIUM_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1234\chrome-win64\chrome.exe"
if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Set REPORT_CHROMIUM_PATH to an installed Chromium before running this Windows gate.' }
$env:REPORT_RENDERER = 'html'
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgres://bogus:bogus@10.255.255.1:9999/nope'
$r2Db = 'r2-report-gates-' + [guid]::NewGuid().ToString('N')
docker run -d --rm --name $r2Db -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=r2-disposable-test-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE) { throw 'Disposable DB creation failed; do not reuse an unknown database.' }
try {
 $ready = $false
 for ($i=0; $i -lt 30; $i++) {
  docker exec $r2Db pg_isready -U inspection_app -d phase6_seed_integration
  if ($LASTEXITCODE -eq 0) { $ready=$true; break }
  Start-Sleep -Seconds 1
 }
 if (!$ready) { throw 'Disposable DB not ready' }
 $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:r2-disposable-test-only@127.0.0.1:55432/phase6_seed_integration'
 Push-Location apps/api
 try {
  foreach ($gate in @('typecheck','build','test:historical-matrix','test:v6-evidence','test:wet-chemical-definition','test:final-report','test:final-report-integration','test:final-report-sprinkler','test:final-report-v6','test:report-pdf-engine','test:report-template','test:server-shutdown','test:v6-integration')) {
   npm run $gate
   if ($LASTEXITCODE) { throw "Gate failed: $gate" }
  }
  node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts src/reports/reportViewModel.test.ts
  if ($LASTEXITCODE) { throw 'Contracts/config/view-model gate failed' }
  node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test --test-concurrency=1 src/sync/co2V7.integration.test.ts src/sync/wetChemicalV7.integration.test.ts src/sync/fireAlarmV7.integration.test.ts src/sync/v7EvidenceRace.integration.test.ts
  if ($LASTEXITCODE) { throw 'V7 integrations failed' }
 } finally { Pop-Location }
 foreach ($gate in @('typecheck','build','test:v7-stale-evidence')) {
  npm --prefix apps/web run $gate
  if ($LASTEXITCODE) { throw "Web gate failed: $gate" }
 }
 git diff --check
 if ($LASTEXITCODE) { throw 'Whitespace gate failed' }
 git status --short
} finally { docker rm -f $r2Db }


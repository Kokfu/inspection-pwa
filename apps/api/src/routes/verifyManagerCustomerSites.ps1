$ErrorActionPreference = 'Stop'
Set-Location C:\PWA_OfflineRecordWebApp
# Refuse an occupied port; never remove another task's disposable or runtime DB.
docker run -d --rm --name s3a-site-verify -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=s3a-disposable-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable S3a database; free localhost:55432 first.' }
$oldDatabase = $env:DATABASE_URL
$oldSeedDatabase = $env:SEED_INTEGRATION_DATABASE_URL
$oldNodeEnv = $env:NODE_ENV
try {
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec s3a-site-verify pg_isready -U inspection_app -d phase6_seed_integration
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not become ready.' }
  $env:NODE_ENV = 'test'
  $env:SEED_INTEGRATION_DATABASE_URL = 'postgres://inspection_app:s3a-disposable-only@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL = $env:SEED_INTEGRATION_DATABASE_URL
  Set-Location C:\PWA_OfflineRecordWebApp\apps\api
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed.' }
  node --import tsx --test src/routes/managerCustomerSites.test.ts src/routes/managerCustomers.test.ts src/inspections/siteProposal.test.ts src/jobs/serviceVisits.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed.' }
  foreach ($file in @('src/routes/managerCustomerSites.integration.test.ts', 'src/routes/managerCustomers.integration.test.ts', 'src/routes/siteProposals.integration.test.ts', 'src/jobs/serviceVisits.integration.test.ts')) {
    node --import tsx --test $file
    if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
  }
  Set-Location C:\PWA_OfflineRecordWebApp
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'Diff whitespace check failed.' }
} finally {
  $env:DATABASE_URL = $oldDatabase
  $env:SEED_INTEGRATION_DATABASE_URL = $oldSeedDatabase
  $env:NODE_ENV = $oldNodeEnv
  Set-Location C:\PWA_OfflineRecordWebApp
  docker rm -f s3a-site-verify
}

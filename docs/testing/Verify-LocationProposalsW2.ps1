$ErrorActionPreference = 'Stop'
$w2Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$w2OriginalDirectory = (Get-Location).Path
try {
  Set-Location $w2Root
  # Starts and removes only its own disposable PostgreSQL; overrides inherited DB URLs.
  & ./apps/api/src/routes/verifyLocationProposalsW0.ps1
  if ($LASTEXITCODE -ne 0) { throw 'Standing/W0 gates failed' }
  Set-Location (Join-Path $w2Root 'apps/web')
  & ../api/node_modules/.bin/tsx.cmd --test tests/locationProposalDiff.test.ts tests/layoutProposalAlreadyPending.test.ts tests/headerSyncSummary.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'W1 focused units failed' }
  # testMatch uses globs; CLI patterns are regular expressions and must not use shell globs.
  npx playwright test --config tests/location-proposal-w2.config.ts --workers=1
  if ($LASTEXITCODE -ne 0) { throw 'Combined W1/W2 browser gates failed' }
  Set-Location $w2Root
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
  git status --short
} finally {
  Set-Location $w2OriginalDirectory
}

# Read-only baseline comparison: reconstruct the captured pre-C1 App in temporary
# sibling files, run the current compatibility fixtures, then remove only those files.
# The fixture readiness/control fixes preserve the original assertions; require PASS.
param([string]$Grep = '(fire_alarm_detector|co2_fire_extinguisher|fm200_fire_suppression|wet_chemical): saved retired')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'C:\PWA_OfflineRecordWebApp'
$repoRoot = (Get-Location).Path
$appProof = Join-Path $repoRoot 'apps/web/src/App.c1-prechange-proof.tsx'
$specProof = Join-Path $repoRoot 'apps/web/tests/c1-prechange-proof.spec.ts'
if ((Test-Path -LiteralPath $appProof) -or (Test-Path -LiteralPath $specProof)) { throw 'Proof paths already exist; preserve them.' }
$savedNode = $env:NODE_ENV
$exitCode = 1
try {
  $source = Get-Content apps/web/src/App.tsx -Raw
  $lines = $source -split '\r?\n' | Where-Object {
    $_ -notmatch '^(import \{ RepairList \}|  \| \{ name: "repair-(list|service)"|  if \((parts\[0\] === "repair-list"|route.name === "repair-list"|route.name === "repair-service"))'
  }
  $source = $lines -join "`n"
  # Remove only C1's reviewed recovery integration, then require the same
  # captured byte hash below. Baseline assertions and fixtures stay unchanged.
  $source = $source.Replace('clearManagerLeaveGuard, ', '').Replace('currentWorkspaceUserId, ', '')
  $source = [regex]::Replace($source, '(?s)  // Keep only the same account''s repair editor mounted, hidden and inert while\n.*?    && currentWorkspaceUserId\(\) === authState.user.id \? authState.user : undefined;\n', '')
  $source = $source.Replace('confirmManagerLeave(false)', 'confirmManagerLeave()')
  $source = $source.Replace("    clearManagerLeaveGuard(window.location.hash);`n", '')
  $source = $source.Replace('{technicianExperience || suspendedRepairUser ? (', '{technicianExperience ? (')
  $source = $source.Replace("          suspended={!!suspendedRepairUser}`n", '')
  $source = $source.Replace('if (user.role === "inspector" && routeFromHash().name !== "repair-list" && routeFromHash().name !== "repair-service")', 'if (user.role === "inspector")')
  $source = $source.Replace('if (role === "technician" && currentUser?.role === "inspector" && route.name !== "repair-list" && route.name !== "repair-service")', 'if (role === "technician" && currentUser?.role === "inspector")')
  $source = $source.Replace('if (window.location.hash === landingHash && routeFromHash().name !== "repair-list" && routeFromHash().name !== "repair-service")', 'if (window.location.hash === landingHash)')
  $source = $source.Replace('<AppShell<"jobs" | "repair-list" |', '<AppShell<"jobs" |').Replace('["Repair List", "repair-list"], ', '').Replace('activeRouteName={route.name === "repair-service" ? "repair-list" : route.name}', 'activeRouteName={route.name}')
  $source = [regex]::Replace($source, '(?s)          \{route.name === "repair-list" \|\| route.name === "repair-service" \? \(.*?\) : route.name === "development"', '          {route.name === "development"')
  $encoding = [System.Text.UTF8Encoding]::new($false)
  $expected = 'E26CEB406E8415E9E290B5F308CE70FD8567DFD67BD28F8FCB5D58E5B82A89DB'
  [System.IO.File]::WriteAllText($appProof, $source, $encoding)
  if ((Get-FileHash -LiteralPath $appProof).Hash -ne $expected) { [System.IO.File]::WriteAllText($appProof, $source.Replace("`n", "`r`n"), $encoding) }
  if ((Get-FileHash -LiteralPath $appProof).Hash -ne $expected) { throw 'App is not byte-exact to the pre-C1 snapshot; no baseline claim is permitted.' }
  Write-Output "Pre-C1 App exact SHA256: $expected"
  $spec = @'
import { test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/src/App.tsx*", async route => {
    const response = await route.fetch({ url: route.request().url().replace("/src/App.tsx", "/src/App.c1-prechange-proof.tsx") });
    await route.fulfill({ response });
  });
});
import "./repair-disabled.spec";
'@
  [System.IO.File]::WriteAllText($specProof, $spec, $encoding)
  $env:NODE_ENV = 'test'
  Set-Location -LiteralPath (Join-Path $repoRoot 'apps/web')
  npx.cmd playwright test tests/c1-prechange-proof.spec.ts --grep $Grep --workers=1
  $exitCode = $LASTEXITCODE
} finally {
  Set-Location -LiteralPath $repoRoot
  if (Test-Path -LiteralPath $appProof) { Remove-Item -LiteralPath $appProof }
  if (Test-Path -LiteralPath $specProof) { Remove-Item -LiteralPath $specProof }
  $env:NODE_ENV = $savedNode
}
exit $exitCode

# Run in a fresh PowerShell process. Mock external commands; never start or remove a real container.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$standardSkill = Get-Content (Join-Path $repo '.agents/skills/codex-task-brief/SKILL.md') -Raw
$standardGates = [regex]::Match($standardSkill, '(?s)## Standard gates.*?```\r?\n(.*?)```').Groups[1].Value
if (!$standardGates) { throw 'Standard gate block not found.' }
$originalLocation = Get-Location
$savedEnvironment = @{}
foreach ($name in @('DATABASE_URL', 'SEED_INTEGRATION_DATABASE_URL', 'NODE_ENV', 'REPORT_CHROMIUM_PATH')) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
}
$global:createdNames = [Collections.Generic.HashSet[string]]::new()
function Assert-True($condition, $message) { if (!$condition) { throw $message } }
function global:docker {
  $global:dockerCalls.Add(@($args))
  $global:LASTEXITCODE = 0
  switch ($args[0]) {
    'create' {
      $nameIndex = [Array]::IndexOf($args, '--name')
      Assert-True ($nameIndex -ge 0) 'Container must have a unique name.'
      Assert-True ($global:createdNames.Add([string]$args[$nameIndex + 1])) 'Container name was reused.'
      Assert-True ($args -contains '127.0.0.1:55432:5432') 'Only the disposable localhost port is allowed.'
      Assert-True ($args -notcontains '--rm') 'Cleanup must not race Docker automatic removal after a failed start.'
      if ($global:scenario -eq 'create-failure') { $global:LASTEXITCODE = 1; return }
      return $global:ownedId
    }
    'start' {
      Assert-True ($args[1] -eq $global:ownedId) 'Start must use the created container ID.'
      if ($global:scenario -eq 'occupied-port') { $global:LASTEXITCODE = 1 }
    }
    'exec' {
      Assert-True ($args[1] -eq $global:ownedId) 'Readiness must use the created container ID.'
      if ($global:scenario -eq 'not-ready') { $global:LASTEXITCODE = 1 }
    }
    'rm' {
      Assert-True ($args.Count -eq 3 -and $args[1] -eq '-f' -and $args[2] -eq $global:ownedId) 'Cleanup attempted to remove an unowned container.'
    }
    default { throw "Unexpected Docker operation: $($args[0])" }
  }
}
function global:node {
  $global:LASTEXITCODE = 0
  if ($args[0] -eq '-e') { return (Get-Process -Id $PID).Path }
  $global:suiteCalls++
  if ($global:scenario -eq 'suite-failure' -and ($args -contains 'src/routes/remarkRequests.integration.test.ts' -or $args -contains 'src/sync/wetChemicalV7.integration.test.ts')) {
    $global:LASTEXITCODE = 1
  }
}
function global:npm { $global:LASTEXITCODE = 0 }
function global:git { $global:LASTEXITCODE = 0 }
function global:Start-Sleep { }
try {
  foreach ($runner in @('R2', 'standard')) {
    foreach ($case in @('success', 'create-failure', 'occupied-port', 'not-ready', 'suite-failure')) {
      $global:scenario = $case
      $global:ownedId = [guid]::NewGuid().ToString('N')
      $global:dockerCalls = [Collections.Generic.List[object]]::new()
      $global:suiteCalls = 0
      $failure = $null
      try {
        if ($runner -eq 'R2') { & (Join-Path $PSScriptRoot 'verifyR2RemarkRequests.ps1') | Out-Null }
        else { Invoke-Expression $standardGates | Out-Null }
      } catch { $failure = $_ }
      Assert-True (($case -eq 'success') -eq ($null -eq $failure)) "$runner/$case unexpected outcome: $failure"
      $removals = @($global:dockerCalls | Where-Object { $_[0] -eq 'rm' })
      Assert-True ($removals.Count -eq $(if ($case -eq 'create-failure') { 0 } else { 1 })) "$runner/$case cleanup count is wrong."
      if ($case -eq 'occupied-port') {
        Assert-True ($failure.ToString() -match 'No existing container was stopped') "$runner must explain that an occupied port is preserved."
        Assert-True (@($global:dockerCalls | Where-Object { $_[0] -eq 'exec' }).Count -eq 0) 'A failed start must not run database checks.'
      }
      if ($runner -eq 'R2' -and $case -in @('create-failure', 'occupied-port', 'not-ready')) {
        Assert-True ($global:suiteCalls -eq 0) 'R2 tests must not run against an unavailable database.'
      }
      Write-Output "PASS: $runner/$case (cleanup uses only the owned ID; other containers are untouched)"
    }
  }
} finally {
  foreach ($command in @('docker', 'node', 'npm', 'git', 'Start-Sleep')) { Remove-Item "Function:global:$command" }
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  Set-Location $originalLocation
}

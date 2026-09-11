param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$ManifestFile,

    [string]$TargetContainerName = "inspection-restore-drill",
    [int]$TargetPort = 55432,
    [string]$TargetDb = "inspection",
    [string]$TargetUser = "inspection_app",
    [string]$TargetPassword = "replace-with-a-real-secret-outside-git",

    # Skip spinning up a fresh disposable container and restore into an already-running one instead.
    [switch]$UseExistingContainer,

    # Required whenever TargetContainerName/UseExistingContainer differ from the disposable-drill
    # default, so a real (non-default) target can never be hit by accident.
    [switch]$IAcknowledgeThisIsNotTheDisposableDrillTarget
)

$ErrorActionPreference = "Stop"

# Never restorable, no override possible: the live runtime Postgres container.
$forbiddenContainers = @("inspection_pwa-postgres-1")
if ($forbiddenContainers -contains $TargetContainerName) {
    throw "REFUSED: '$TargetContainerName' is the live runtime PostgreSQL container. Restore-Database.ps1 must never target it, under any flag. Aborting."
}

$isDefaultDisposableTarget = ($TargetContainerName -eq "inspection-restore-drill") -and (-not $UseExistingContainer)
if (-not $isDefaultDisposableTarget -and -not $IAcknowledgeThisIsNotTheDisposableDrillTarget) {
    throw "REFUSED: target '$TargetContainerName' (UseExistingContainer=$UseExistingContainer) is not the default disposable drill container. Pass -IAcknowledgeThisIsNotTheDisposableDrillTarget to confirm this is a throwaway/test database and never production. Aborting."
}
if (-not $isDefaultDisposableTarget) {
    Write-Warning "RESTORING INTO NON-DEFAULT TARGET '$TargetContainerName' (UseExistingContainer=$UseExistingContainer). Confirm this is NOT a production or runtime database."
}

if (-not $ManifestFile) {
    $resolvedBackup = Resolve-Path -LiteralPath $BackupFile
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension((Split-Path -Leaf $resolvedBackup))
    $ManifestFile = Join-Path (Split-Path -Parent $resolvedBackup) "$baseName.manifest.json"
}

Write-Host "Backup file: $BackupFile"
Write-Host "Manifest file: $ManifestFile"

if (-not (Test-Path -LiteralPath $ManifestFile)) {
    throw "Manifest file not found: $ManifestFile. Refusing to restore an unverified backup."
}

$manifest = Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json
$actualHash = (Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256).Hash.ToLower()
if ($actualHash -ne $manifest.sha256) {
    throw "Checksum mismatch. Manifest expects $($manifest.sha256), backup file has $actualHash. Refusing to restore a possibly corrupted backup."
}
Write-Host "Checksum verified: $actualHash"

if (-not $UseExistingContainer) {
    Write-Host "Starting disposable target container '$TargetContainerName' on 127.0.0.1:${TargetPort} ..."
    try { docker rm -f $TargetContainerName 2>$null | Out-Null } catch { }

    $dockerRunArgs = @(
        "run", "-d", "--rm", "--name", $TargetContainerName,
        "-e", "POSTGRES_DB=$TargetDb",
        "-e", "POSTGRES_USER=$TargetUser",
        "-e", "POSTGRES_PASSWORD=$TargetPassword",
        "-p", "127.0.0.1:${TargetPort}:5432",
        "postgres:16-alpine"
    )
    docker @dockerRunArgs | Out-Null

    Write-Host "Waiting for target Postgres to become ready..."
    # The official postgres image briefly accepts connections on a temporary
    # init server before restarting into the real one; pg_isready can report
    # ready during that window. Require several consecutive successes before
    # trusting it, so pg_restore doesn't race the restart.
    $consecutiveReady = 0
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        try { docker exec $TargetContainerName pg_isready -U $TargetUser -d $TargetDb *> $null } catch { }
        if ($LASTEXITCODE -eq 0) {
            $consecutiveReady++
            if ($consecutiveReady -ge 3) { $ready = $true; break }
        } else {
            $consecutiveReady = 0
        }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) {
        throw "Target Postgres container '$TargetContainerName' did not become ready in time."
    }
}

Write-Host "Copying dump into container..."
docker cp $BackupFile "${TargetContainerName}:/tmp/restore.dump"

Write-Host "Running pg_restore..."
docker exec $TargetContainerName pg_restore -U $TargetUser -d $TargetDb --clean --if-exists --no-owner /tmp/restore.dump
if ($LASTEXITCODE -ne 0) {
    Write-Warning "pg_restore exited with code $LASTEXITCODE. --clean --if-exists commonly warns about objects absent from a fresh database; review the output above before trusting this restore."
}

Write-Host ""
Write-Host "Restore complete into '$TargetContainerName' (db=$TargetDb, 127.0.0.1:${TargetPort})."
Write-Host "This container is left running for verification. Remove it when done:"
Write-Host "  docker rm -f $TargetContainerName"

param(
    [string]$OutputRoot = "C:\InspectionSystem\runtime\backups\postgres",
    [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $OutputRoot "inspection-$timestamp.dump"
$manifestFile = Join-Path $OutputRoot "inspection-$timestamp.manifest.json"

Write-Host "Creating PostgreSQL backup with pg_dump..."
Write-Host "Output: $outputFile"
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

# POSTGRES_USER/POSTGRES_DB are Compose variables, not host environment variables - Compose's
# .env file feeds substitution inside docker-compose.yml, it does not populate this PowerShell
# process's own environment. Reading $env:POSTGRES_USER / $env:POSTGRES_DB from the host would
# silently be null in a normal shell. Resolve the values the live container is actually running
# with instead. try/catch because, in Windows PowerShell 5.1, redirecting a native command's
# stderr (even to $null) can still surface as a terminating NativeCommandError under
# $ErrorActionPreference = "Stop" - e.g. if the postgres service isn't running.
$pgUser = $null
try { $pgUser = docker compose -f $ComposeFile exec -T postgres printenv POSTGRES_USER 2>$null } catch { }
if ($LASTEXITCODE -ne 0 -or -not $pgUser) {
    throw "Could not resolve POSTGRES_USER from the running postgres container. Aborting rather than running pg_dump with a missing credential."
}
$pgUser = $pgUser.Trim()

$pgDb = $null
try { $pgDb = docker compose -f $ComposeFile exec -T postgres printenv POSTGRES_DB 2>$null } catch { }
if ($LASTEXITCODE -ne 0 -or -not $pgDb) {
    throw "Could not resolve POSTGRES_DB from the running postgres container. Aborting rather than running pg_dump with a missing database name."
}
$pgDb = $pgDb.Trim()

# Dump to a file inside the container, then `docker compose cp` it out as raw bytes.
# Capturing the pg_dump custom-format (binary) stdout through PowerShell `>` corrupts it
# (PowerShell re-encodes the byte stream as text and prepends a UTF-8 BOM).
$containerDumpPath = "/tmp/inspection-$timestamp.dump"
docker compose -f $ComposeFile exec -T postgres pg_dump -U $pgUser -d $pgDb -Fc -f $containerDumpPath
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump exited with code $LASTEXITCODE inside the postgres container. Aborting before attempting to copy anything out."
}

docker compose -f $ComposeFile cp "postgres:${containerDumpPath}" $outputFile
if ($LASTEXITCODE -ne 0) {
    throw "docker compose cp failed with exit code $LASTEXITCODE copying the dump out of the postgres container. The container-local dump at '$containerDumpPath' was left in place (not deleted) so it can still be recovered manually or the copy retried."
}

# Verify the host copy actually landed and is non-empty BEFORE removing the container-local
# temp file - never delete the only other copy of the dump on a failed or incomplete host copy.
if (-not (Test-Path -LiteralPath $outputFile)) {
    throw "docker compose cp reported success but '$outputFile' does not exist on the host. Aborting without deleting the container-local dump at '$containerDumpPath'."
}
$item = Get-Item -LiteralPath $outputFile
if ($item.Length -le 0) {
    throw "Backup file is empty: $outputFile. Aborting without deleting the container-local dump at '$containerDumpPath'."
}

docker compose -f $ComposeFile exec -T postgres rm -f $containerDumpPath
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to remove the container-local temp dump '$containerDumpPath' (exit $LASTEXITCODE). The host copy at '$outputFile' is already verified good - this only leaves a leftover temp file in the container and does not affect backup correctness."
}

$hash = (Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash.ToLower()
$manifest = [ordered]@{
    type         = "postgres-dump"
    file         = $item.Name
    sha256       = $hash
    sizeBytes    = $item.Length
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestFile -Encoding utf8

Write-Host "Manifest: $manifestFile"
Write-Host "SHA-256: $hash"


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

# Dump to a file inside the container, then `docker compose cp` it out as raw bytes.
# Capturing the pg_dump custom-format (binary) stdout through PowerShell `>` corrupts it
# (PowerShell re-encodes the byte stream as text and prepends a UTF-8 BOM).
$containerDumpPath = "/tmp/inspection-$timestamp.dump"
docker compose -f $ComposeFile exec -T postgres pg_dump -U $env:POSTGRES_USER -d $env:POSTGRES_DB -Fc -f $containerDumpPath
docker compose -f $ComposeFile cp "postgres:${containerDumpPath}" $outputFile
docker compose -f $ComposeFile exec -T postgres rm -f $containerDumpPath

$item = Get-Item -LiteralPath $outputFile
if ($item.Length -le 0) {
    throw "Backup file is empty: $outputFile"
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


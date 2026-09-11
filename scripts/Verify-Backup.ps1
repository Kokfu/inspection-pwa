param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,

    [string]$ManifestPath
)

$ErrorActionPreference = "Stop"

Write-Host "Verifying backup file presence and size..."
$item = Get-Item -LiteralPath $BackupPath
if ($item.Length -le 0) {
    throw "Backup file is empty."
}
Write-Host "Backup exists and is non-empty: $($item.FullName)"

if (-not $ManifestPath) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)
    $ManifestPath = Join-Path $item.DirectoryName "$baseName.manifest.json"
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Manifest file not found: $ManifestPath. A backup without a manifest cannot be verified or safely restored."
}
Write-Host "Manifest: $ManifestPath"

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json

if ($manifest.file -ne $item.Name) {
    throw "Manifest file name '$($manifest.file)' does not match backup file name '$($item.Name)'."
}

if ($manifest.sizeBytes -ne $item.Length) {
    throw "Manifest size ($($manifest.sizeBytes) bytes) does not match actual file size ($($item.Length) bytes)."
}

$actualHash = (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash.ToLower()
if ($actualHash -ne $manifest.sha256) {
    throw "Checksum mismatch. Manifest expects $($manifest.sha256), file has $actualHash."
}
Write-Host "Checksum verified: $actualHash"

if ($manifest.fileCount) {
    Write-Host "Manifest reports file count: $($manifest.fileCount)"
}

Write-Host "Backup verification PASSED."


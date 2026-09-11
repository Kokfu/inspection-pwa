param(
    [string]$UploadsPath = "C:\InspectionSystem\runtime\uploads",
    [string]$OutputRoot = "C:\InspectionSystem\runtime\backups\uploads"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $OutputRoot "uploads-$timestamp.zip"
$manifestFile = Join-Path $OutputRoot "uploads-$timestamp.manifest.json"

Write-Host "Creating uploads archive..."
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
Compress-Archive -Path (Join-Path $UploadsPath "*") -DestinationPath $outputFile -Force
Write-Host "Output: $outputFile"

$fileCount = (Get-ChildItem -LiteralPath $UploadsPath -Recurse -File | Measure-Object).Count
$item = Get-Item -LiteralPath $outputFile
if ($item.Length -le 0) {
    throw "Uploads archive is empty: $outputFile"
}

$hash = (Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash.ToLower()
$manifest = [ordered]@{
    type         = "uploads-archive"
    file         = $item.Name
    sha256       = $hash
    sizeBytes    = $item.Length
    fileCount    = $fileCount
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestFile -Encoding utf8

Write-Host "Manifest: $manifestFile"
Write-Host "SHA-256: $hash"
Write-Host "File count: $fileCount"


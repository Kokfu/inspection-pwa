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

# Compress-Archive's own "*" wildcard expansion silently skips Hidden-attribute items - and,
# separately, Compress-Archive's OWN internal implementation reads each entry's metadata via
# Get-Item WITHOUT -Force, so even handing it a hidden file's path explicitly still fails
# ("Could not find item ..."). Build the zip directly with System.IO.Compression.ZipFile
# instead, driven by one -Force enumeration, so hidden files at any depth are archived and
# counted from the exact same file list.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path -LiteralPath $outputFile) { Remove-Item -LiteralPath $outputFile -Force }
$uploadsRoot = (Get-Item -LiteralPath $UploadsPath -Force).FullName.TrimEnd('\')
$sourceFiles = Get-ChildItem -LiteralPath $UploadsPath -Recurse -File -Force

$zip = [System.IO.Compression.ZipFile]::Open($outputFile, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $sourceFiles) {
        $relativePath = $file.FullName.Substring($uploadsRoot.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $file.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $zip.Dispose()
}
Write-Host "Output: $outputFile"

$fileCount = ($sourceFiles | Measure-Object).Count
if (-not (Test-Path -LiteralPath $outputFile)) {
    throw "Uploads archive was not created: $outputFile"
}
$item = Get-Item -LiteralPath $outputFile
if ($fileCount -gt 0 -and $item.Length -le 0) {
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


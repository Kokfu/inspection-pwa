param(
    [Parameter(Mandatory = $true)]
    [string]$ArchiveFile,

    [string]$ManifestFile,

    [string]$DestinationPath = "C:\InspectionSystem\runtime\restore-staging\uploads",

    # Required to extract into the live uploads bind mount instead of a staging path.
    [switch]$OverwriteLiveUploads,
    [string]$LiveUploadsPath = "C:\InspectionSystem\runtime\uploads"
)

$ErrorActionPreference = "Stop"

if (-not $ManifestFile) {
    $resolvedArchive = Resolve-Path -LiteralPath $ArchiveFile
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension((Split-Path -Leaf $resolvedArchive))
    $ManifestFile = Join-Path (Split-Path -Parent $resolvedArchive) "$baseName.manifest.json"
}

Write-Host "Archive file: $ArchiveFile"
Write-Host "Manifest file: $ManifestFile"

if (-not (Test-Path -LiteralPath $ManifestFile)) {
    throw "Manifest file not found: $ManifestFile. Refusing to restore an unverified archive."
}

$manifest = Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json
$actualHash = (Get-FileHash -LiteralPath $ArchiveFile -Algorithm SHA256).Hash.ToLower()
if ($actualHash -ne $manifest.sha256) {
    throw "Checksum mismatch. Manifest expects $($manifest.sha256), archive file has $actualHash. Refusing to restore a possibly corrupted archive."
}
Write-Host "Checksum verified: $actualHash"

# Defense in depth: refuse even if -DestinationPath was pointed at the live path directly,
# not just via the -OverwriteLiveUploads shortcut for it. Compare normalized full paths
# rather than Resolve-Path, which errors/no-ops on a path that doesn't exist yet — the live
# uploads folder may not have been created on this PC, and the guard must still hold then.
# GetFullPath leaves the \\?\ extended-length prefix (and \\?\UNC\) untouched instead of
# collapsing it to the ordinary form, so strip those prefixes before comparing — otherwise
# "\\?\C:\...\uploads" would not match "C:\...\uploads" and the guard would miss the alias.
function Get-NormalizedRestorePath {
    param([string]$Path)
    $full = [System.IO.Path]::GetFullPath($Path)
    if ($full.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) {
        $full = '\\' + $full.Substring(8)
    } elseif ($full.StartsWith('\\?\', [StringComparison]::OrdinalIgnoreCase)) {
        $full = $full.Substring(4)
    }
    return $full.TrimEnd('\')
}
$normalizedDestination = Get-NormalizedRestorePath $DestinationPath
$normalizedLive = Get-NormalizedRestorePath $LiveUploadsPath
$destinationMatchesLive = $normalizedDestination -eq $normalizedLive

if ($destinationMatchesLive -and -not $OverwriteLiveUploads) {
    throw "REFUSED: destination '$DestinationPath' resolves to the live uploads bind mount ($LiveUploadsPath) but -OverwriteLiveUploads was not passed. Aborting."
}

$target = $DestinationPath
if ($OverwriteLiveUploads) {
    Write-Warning "OVERWRITING LIVE UPLOADS BIND MOUNT: $LiveUploadsPath. This was explicitly requested with -OverwriteLiveUploads."
    $target = $LiveUploadsPath
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Write-Host "Extracting into: $target"
Expand-Archive -LiteralPath $ArchiveFile -DestinationPath $target -Force

$extractedCount = (Get-ChildItem -LiteralPath $target -Recurse -File | Measure-Object).Count
Write-Host "Extracted file count: $extractedCount"
if ($manifest.fileCount -and $extractedCount -ne $manifest.fileCount) {
    Write-Warning "Extracted file count ($extractedCount) does not match manifest fileCount ($($manifest.fileCount))."
}

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
# not just via the -OverwriteLiveUploads shortcut for it. A lexical string compare (even after
# stripping the \\?\ extended-length prefix) is not enough: an NTFS junction, a `subst`-mapped
# drive letter, or an 8.3 short name can all make -DestinationPath resolve to the exact same
# physical directory as -LiveUploadsPath while its string form differs. Resolve both sides to
# their canonical filesystem identity via GetFinalPathNameByHandle (which follows reparse points
# and subst mappings and normalizes 8.3 names, the same way opening the path for real I/O would)
# before comparing. The live/destination directory may not exist yet, so walk up to the nearest
# existing ancestor, canonicalize THAT, and reattach the not-yet-created suffix literally — an
# ancestor that is itself a junction/subst alias is still caught this way.
if (-not ([System.Management.Automation.PSTypeName]'InspectionRestoreUploads.PathIdentity').Type) {
    Add-Type -Namespace InspectionRestoreUploads -Name PathIdentity -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern IntPtr CreateFileW(
    string lpFileName, uint dwDesiredAccess, uint dwShareMode,
    IntPtr lpSecurityAttributes, uint dwCreationDisposition,
    uint dwFlagsAndAttributes, IntPtr hTemplateFile);

[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern uint GetFinalPathNameByHandleW(
    IntPtr hFile, System.Text.StringBuilder lpszFilePath, uint cchFilePath, uint dwFlags);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool CloseHandle(IntPtr hObject);
'@
}

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

function Get-CanonicalDirectoryPath {
    # Opens a handle to an EXISTING directory and asks Windows for its final resolved path —
    # this follows junctions/symlinks and subst mappings and returns the true long-name form
    # (defeating 8.3 aliases too), unlike any purely lexical string operation. Returns $null if
    # the path can't be opened (doesn't exist, no permission, etc.) so the caller can fail closed.
    param([string]$Path)
    $FILE_SHARE_ALL = 0x00000007
    $OPEN_EXISTING = 3
    $FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
    $handle = [InspectionRestoreUploads.PathIdentity]::CreateFileW(
        $Path, 0, $FILE_SHARE_ALL, [IntPtr]::Zero, $OPEN_EXISTING, $FILE_FLAG_BACKUP_SEMANTICS, [IntPtr]::Zero)
    if ($handle -eq [IntPtr]::Zero -or $handle.ToInt64() -eq -1) {
        return $null
    }
    try {
        $sb = New-Object System.Text.StringBuilder 32768
        $len = [InspectionRestoreUploads.PathIdentity]::GetFinalPathNameByHandleW($handle, $sb, [uint32]$sb.Capacity, 0)
        if ($len -eq 0 -or $len -gt $sb.Capacity) { return $null }
        $resolved = $sb.ToString(0, [int]$len)
        if ($resolved.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) {
            $resolved = '\\' + $resolved.Substring(8)
        } elseif ($resolved.StartsWith('\\?\', [StringComparison]::OrdinalIgnoreCase)) {
            $resolved = $resolved.Substring(4)
        }
        return $resolved.TrimEnd('\')
    } finally {
        [InspectionRestoreUploads.PathIdentity]::CloseHandle($handle) | Out-Null
    }
}

function Get-CanonicalComparisonPath {
    # Resolve as much of $Path as physically exists to its canonical filesystem identity, then
    # reattach whatever suffix doesn't exist yet (literally — nothing to alias there since it
    # isn't a real filesystem object). Fails closed (throws) if no existing ancestor can be
    # found or opened, rather than silently falling back to an unresolved lexical compare.
    param([string]$Path)
    $current = Get-NormalizedRestorePath $Path
    $suffixSegments = @()
    while (-not (Test-Path -LiteralPath $current -PathType Container)) {
        $parent = Split-Path -Path $current -Parent
        if (-not $parent -or $parent -eq $current) {
            throw "REFUSED: cannot establish filesystem identity for '$Path' - no existing ancestor directory found. Aborting rather than comparing an unresolved path."
        }
        $suffixSegments = @((Split-Path -Path $current -Leaf)) + $suffixSegments
        $current = $parent
    }
    $canonicalAncestor = Get-CanonicalDirectoryPath $current
    if (-not $canonicalAncestor) {
        throw "REFUSED: cannot establish filesystem identity for '$Path' - unable to resolve '$current'. Aborting rather than comparing an unresolved path."
    }
    if ($suffixSegments.Count -gt 0) {
        return (Join-Path $canonicalAncestor ($suffixSegments -join '\')).TrimEnd('\')
    }
    return $canonicalAncestor
}

$normalizedDestination = Get-CanonicalComparisonPath $DestinationPath
$normalizedLive = Get-CanonicalComparisonPath $LiveUploadsPath
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

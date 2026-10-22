[CmdletBinding()]
param(
    # Folder that contains docker-compose.yml. Defaults to the parent of this scripts folder.
    [string]$ProjectPath = "",

    [string]$BackupRoot = "C:\InspectionSystem\runtime\backups",
    [string]$UploadsPath = "C:\InspectionSystem\runtime\uploads",

    # Holds the company profile (letterhead), the uploaded company logo and the e-mail
    # encryption key. Neither Backup-Database.ps1 nor Backup-Uploads.ps1 covers it.
    [string]$OperationalPath = "C:\InspectionSystem\runtime\operational",

    # Optional off-PC folder (external drive, NAS share, synced cloud folder). Each new
    # backup set is copied there after it verifies. Nothing is ever deleted there.
    [string]$CopyTo = "",

    # Delete local backup sets older than this many days. 0 = never delete.
    # The newest $KeepAtLeast sets of each kind are always kept, whatever their age.
    [int]$KeepDays = 14,
    [int]$KeepAtLeast = 3
)

# One complete recovery set: database dump, photos zip, operational-folder zip, each with a
# SHA-256 manifest, verified, optionally copied off the PC, then old local sets pruned.
# Exits 1 on any failure so Windows Task Scheduler shows "Last Run Result" as failed.
# See docs/handover/07-backup-and-disaster-recovery.md.

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 leaves $PSScriptRoot empty in param defaults under `powershell -File`
# (how Task Scheduler runs scripts), so resolve the default here.
$scriptFolder = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ProjectPath) { $ProjectPath = Split-Path -Parent $scriptFolder }

if ($KeepDays -lt 0) { throw "KeepDays must be 0 (never delete) or more." }
if ($KeepAtLeast -lt 1) { throw "KeepAtLeast must be 1 or more." }

$composeFile = Join-Path $ProjectPath "docker-compose.yml"
if (-not (Test-Path -LiteralPath $composeFile)) {
    throw "docker-compose.yml not found in '$ProjectPath'. Pass -ProjectPath <folder that contains docker-compose.yml>."
}

$postgresRoot = Join-Path $BackupRoot "postgres"
$uploadsRoot = Join-Path $BackupRoot "uploads"
$operationalRoot = Join-Path $BackupRoot "operational"
foreach ($folder in @($postgresRoot, $uploadsRoot, $operationalRoot)) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
}

$logFile = Join-Path $BackupRoot "backup-log.txt"
function Write-Log([string]$message) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
    Write-Host $line
    Add-Content -LiteralPath $logFile -Value $line -Encoding utf8
}

# Returns the newest file in $folder matching $pattern that was written after $since.
function Get-NewBackup([string]$folder, [string]$pattern, [datetime]$since) {
    $file = Get-ChildItem -LiteralPath $folder -Filter $pattern -File |
        Where-Object { $_.LastWriteTime -ge $since } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $file) { throw "No new '$pattern' was written to '$folder'." }
    return $file
}

function New-Manifest([System.IO.FileInfo]$file, [string]$type, [string]$manifestPath, [int]$fileCount) {
    $manifest = [ordered]@{
        type         = $type
        file         = $file.Name
        sha256       = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower()
        sizeBytes    = $file.Length
        fileCount    = $fileCount
        createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8
}

$started = (Get-Date).AddSeconds(-2)
$scripts = $scriptFolder
$newFiles = @()

try {
    Write-Log "Backup started (project '$ProjectPath')."

    # 1. Database. Backup-Database.ps1 uses a relative compose path, so pass it in full.
    & (Join-Path $scripts "Backup-Database.ps1") -OutputRoot $postgresRoot -ComposeFile $composeFile
    $dump = Get-NewBackup $postgresRoot "inspection-*.dump" $started
    & (Join-Path $scripts "Verify-Backup.ps1") -BackupPath $dump.FullName
    $newFiles += $dump.FullName, (Join-Path $postgresRoot "$($dump.BaseName).manifest.json")
    Write-Log "Database backup verified: $($dump.Name) ($([math]::Round($dump.Length / 1MB, 2)) MB)."

    # 2. Photos.
    & (Join-Path $scripts "Backup-Uploads.ps1") -UploadsPath $UploadsPath -OutputRoot $uploadsRoot
    $photos = Get-NewBackup $uploadsRoot "uploads-*.zip" $started
    & (Join-Path $scripts "Verify-Backup.ps1") -BackupPath $photos.FullName
    $newFiles += $photos.FullName, (Join-Path $uploadsRoot "$($photos.BaseName).manifest.json")
    Write-Log "Photos backup verified: $($photos.Name) ($([math]::Round($photos.Length / 1MB, 2)) MB)."

    # 3. Operational folder (letterhead, logo, e-mail key).
    if (-not (Test-Path -LiteralPath $OperationalPath)) {
        throw "Operational folder not found: '$OperationalPath'."
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $operationalZip = Join-Path $operationalRoot "operational-$timestamp.zip"
    $operationalSource = (Get-Item -LiteralPath $OperationalPath -Force).FullName.TrimEnd('\')
    $operationalFiles = Get-ChildItem -LiteralPath $OperationalPath -Recurse -File -Force
    $zip = [System.IO.Compression.ZipFile]::Open($operationalZip, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $operationalFiles) {
            $relativePath = $file.FullName.Substring($operationalSource.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $file.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $zip.Dispose()
    }
    $operationalItem = Get-Item -LiteralPath $operationalZip
    $operationalManifest = Join-Path $operationalRoot "operational-$timestamp.manifest.json"
    New-Manifest $operationalItem "operational-archive" $operationalManifest ($operationalFiles | Measure-Object).Count
    & (Join-Path $scripts "Verify-Backup.ps1") -BackupPath $operationalZip
    $newFiles += $operationalZip, $operationalManifest
    Write-Log "Operational folder backup verified: $($operationalItem.Name) ($(($operationalFiles | Measure-Object).Count) files)."

    # 4. Off-PC copy, then verify the copies against their manifests.
    if ($CopyTo) {
        if (-not (Test-Path -LiteralPath $CopyTo)) {
            throw "Off-PC folder '$CopyTo' is not reachable (drive unplugged or share offline). Local backup is fine; the off-PC copy was NOT made."
        }
        foreach ($path in $newFiles) {
            $kind = Split-Path -Leaf (Split-Path -Parent $path)
            $target = Join-Path $CopyTo $kind
            New-Item -ItemType Directory -Force -Path $target | Out-Null
            Copy-Item -LiteralPath $path -Destination $target -Force
        }
        foreach ($path in $newFiles | Where-Object { $_ -notlike "*.manifest.json" }) {
            $kind = Split-Path -Leaf (Split-Path -Parent $path)
            & (Join-Path $scripts "Verify-Backup.ps1") -BackupPath (Join-Path (Join-Path $CopyTo $kind) (Split-Path -Leaf $path))
        }
        Write-Log "Off-PC copy verified in '$CopyTo'."
    }

    # 5. Prune old local sets. Only files this backup system writes are ever considered.
    if ($KeepDays -gt 0) {
        $cutoff = (Get-Date).AddDays(-$KeepDays)
        $kinds = @(
            @{ Folder = $postgresRoot; Pattern = "inspection-*.dump" },
            @{ Folder = $uploadsRoot; Pattern = "uploads-*.zip" },
            @{ Folder = $operationalRoot; Pattern = "operational-*.zip" }
        )
        $removed = 0
        foreach ($kind in $kinds) {
            $sets = Get-ChildItem -LiteralPath $kind.Folder -Filter $kind.Pattern -File | Sort-Object LastWriteTime -Descending
            foreach ($old in ($sets | Select-Object -Skip $KeepAtLeast | Where-Object { $_.LastWriteTime -lt $cutoff })) {
                $oldManifest = Join-Path $kind.Folder "$($old.BaseName).manifest.json"
                Remove-Item -LiteralPath $old.FullName -Force
                if (Test-Path -LiteralPath $oldManifest) { Remove-Item -LiteralPath $oldManifest -Force }
                $removed++
            }
        }
        Write-Log "Pruned $removed old local backup set(s) older than $KeepDays days (kept at least $KeepAtLeast of each kind)."
    }

    $free = (Get-PSDrive -Name ((Get-Item -LiteralPath $BackupRoot).PSDrive.Name)).Free
    Write-Log ("Backup finished OK. Free disk space: {0:N1} GB." -f ($free / 1GB))
    exit 0
}
catch {
    Write-Log "BACKUP FAILED: $($_.Exception.Message)"
    exit 1
}

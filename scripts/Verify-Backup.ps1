param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath
)

Write-Host "Verifying backup file presence and size..."
$item = Get-Item -LiteralPath $BackupPath
if ($item.Length -le 0) {
    throw "Backup file is empty."
}
Write-Host "Backup exists and is non-empty: $($item.FullName)"


param(
    [Parameter(Mandatory = $true)]
    [string]$ArchiveFile,
    [string]$UploadsPath = "C:\InspectionSystem\runtime\uploads"
)

Write-Host "Restore uploads skeleton only. Confirm destination before production use."
Write-Host "Archive file: $ArchiveFile"
Write-Host "Destination: $UploadsPath"


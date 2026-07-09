param(
    [string]$UploadsPath = "C:\InspectionSystem\runtime\uploads",
    [string]$OutputRoot = "C:\InspectionSystem\runtime\backups\uploads"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $OutputRoot "uploads-$timestamp.zip"

Write-Host "Creating uploads archive..."
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
Compress-Archive -Path (Join-Path $UploadsPath "*") -DestinationPath $outputFile -Force
Write-Host "Output: $outputFile"


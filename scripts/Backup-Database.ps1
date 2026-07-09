param(
    [string]$OutputRoot = "C:\InspectionSystem\runtime\backups\postgres",
    [string]$ComposeFile = "docker-compose.yml"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $OutputRoot "inspection-$timestamp.dump"

Write-Host "Creating PostgreSQL backup with pg_dump..."
Write-Host "Output: $outputFile"
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

docker compose -f $ComposeFile exec -T postgres pg_dump -U $env:POSTGRES_USER -d $env:POSTGRES_DB -Fc > $outputFile


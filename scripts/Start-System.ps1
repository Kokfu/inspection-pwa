param(
    [string]$ComposeFile = "docker-compose.yml"
)

Write-Host "Starting Inspection PWA services..."
Write-Host "Ensure Docker Desktop is running before using this script."
docker compose -f $ComposeFile up -d


param(
    [string]$ComposeFile = "docker-compose.yml"
)

Write-Host "Stopping Inspection PWA services without deleting volumes..."
docker compose -f $ComposeFile stop


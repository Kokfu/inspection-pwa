param(
    [string]$ComposeFile = "docker-compose.yml"
)

Write-Host "Update skeleton only."
Write-Host "Required flow: backup, record current image tags, deploy, migrate, health check, stale-cache test, rollback if needed."
docker compose -f $ComposeFile config


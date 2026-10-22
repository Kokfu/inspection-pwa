param(
    [string]$ComposeFile = "docker-compose.yml"
)

# Checklist only; it changes nothing. Full steps: docs/it-guide/01-running-the-system.md, "Installing an update".
Write-Host "Update checklist:"
Write-Host "  1. Technicians sync everything (All submitted changes synced)."
Write-Host "  2. .\scripts\Backup-All.ps1 -CopyTo '<off-PC folder>'   (must end with Backup finished OK)"
Write-Host "  3. git log -1 --format='%h %s'   (note the current version)"
Write-Host "  4. git pull"
Write-Host "  5. docker compose --profile tunnel up -d --build"
Write-Host "  6. Check: docker compose --profile tunnel ps, docker compose logs api --tail=50, sign in on each role."

# --quiet: validate without printing the resolved configuration, which would show the secrets from .env.
docker compose -f $ComposeFile config --quiet
if ($LASTEXITCODE -eq 0) { Write-Host "Compose file is valid." } else { throw "docker compose config failed (exit $LASTEXITCODE)." }

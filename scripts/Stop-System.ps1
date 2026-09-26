param(
    [string]$ComposeFile = "docker-compose.yml",
    # Pass "tunnel" if the stack was started with -ComposeProfile tunnel, so the
    # cloudflared connector is stopped too. Compose otherwise leaves a profiled
    # service running when it's not named on this command.
    [string]$ComposeProfile = ""
)

Write-Host "Stopping Inspection PWA services without deleting volumes..."

if ($ComposeProfile) {
    docker compose -f $ComposeFile --profile $ComposeProfile stop
}
else {
    docker compose -f $ComposeFile stop
}


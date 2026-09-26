param(
    [string]$ComposeFile = "docker-compose.yml",
    # Pass "tunnel" to also start the cloudflared connector (named Cloudflare Tunnel
    # hosting route). Leave empty for the default direct-hosting route. See
    # docs/client-install-and-public-access.md.
    [string]$ComposeProfile = ""
)

Write-Host "Starting Inspection PWA services..."
Write-Host "Ensure Docker Desktop is running before using this script."

if ($ComposeProfile) {
    docker compose -f $ComposeFile --profile $ComposeProfile up -d
}
else {
    docker compose -f $ComposeFile up -d
}


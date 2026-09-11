param(
    [string]$ComposeFile = "docker-compose.yml",
    # Caddy's site block is implicit-HTTPS (see infra/reverse-proxy/Caddyfile), so its
    # plain port-80 listener only ever issues a 308 redirect to https, never serves
    # content. Point the tunnel at Caddy's HTTPS listener directly instead.
    [string]$LocalUrl = "https://localhost:443"
)

$ErrorActionPreference = "Stop"

$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
    Write-Host "cloudflared is not on PATH. Install it, then re-run this script: winget install --id Cloudflare.cloudflared -e   (or: choco install cloudflared)"
    exit 1
}

$runningServices = docker compose -f $ComposeFile ps --status running --services
if ($LASTEXITCODE -ne 0) {
    Write-Host "Could not query the compose stack. Is Docker Desktop running?"
    exit 1
}
if (-not ($runningServices -contains "proxy")) {
    Write-Host "The 'proxy' service is not running. Start the stack first, then re-run this script:"
    Write-Host "  .\scripts\Start-System.ps1"
    exit 1
}

Write-Host "Starting a temporary Cloudflare quick tunnel to $LocalUrl ..."
Write-Host ""

$urlPattern = "https://[a-zA-Z0-9-]+\.trycloudflare\.com"
$printed = $false

# cloudflared logs to stderr. Merging streams with PowerShell's own "2>&1" turns each
# stderr line into a NativeCommandError under $ErrorActionPreference = "Stop" (Windows
# PowerShell 5.1). Routing the merge through cmd.exe avoids that: PowerShell only ever
# sees cmd's plain stdout text.
# --no-tls-verify covers only the cloudflared-to-Caddy leg on localhost, which uses
# Caddy's local/self-signed certificate. It has no effect on the publicly-trusted
# certificate Cloudflare's edge presents to the phone.
#
# --http-host-header localhost: cloudflared forwards the public tunnel hostname as the
# Host header by default. Caddy's site block only matches "Host: localhost" (see
# infra/reverse-proxy/Caddyfile); any other Host gets Caddy's empty default response.
# Overriding the Host header sent to the origin (not the public URL) makes the request
# land on the right site block.
& cmd /c "cloudflared tunnel --url $LocalUrl --no-tls-verify --http-host-header localhost 2>&1" | ForEach-Object {
    $line = $_.ToString()
    Write-Host $line
    if (-not $printed -and $line -match $urlPattern) {
        $printed = $true
        Write-Host ""
        Write-Host "=================================================================="
        Write-Host "  Temporary test URL: $($Matches[0])"
        Write-Host "  TEMPORARY test URL - changes every run. Never treat this as the"
        Write-Host "  production origin. Stop with Ctrl+C when done testing."
        Write-Host "=================================================================="
        Write-Host ""
    }
}

Write-Host "Tunnel stopped."

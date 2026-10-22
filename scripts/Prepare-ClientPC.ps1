[CmdletBinding()]
param(
    # Folder that contains docker-compose.yml. Defaults to the parent of this scripts folder.
    [string]$ProjectPath = "",

    # Persistent data folder on the client PC. Must match the INSPECTION_*_PATH values in .env.
    [string]$RuntimeRoot = "C:\InspectionSystem\runtime",

    # Public hostname the client owns, e.g. app.example.com (no scheme).
    [Parameter(Mandatory = $true)]
    [string]$Hostname,

    # Cloudflare Tunnel (recommended) writes PUBLIC_HOSTNAME=http://<host> and asks for the tunnel token.
    # Direct hosting (static IP + router forwarding) writes the bare hostname and needs no token.
    [ValidateSet("tunnel", "direct")]
    [string]$Mode = "tunnel"
)

# One-time preparation of a client PC: runtime folders + a private .env with a generated
# database password. It never overwrites an existing .env, never prints the password or the
# tunnel token, and never touches Git. Run once, from PowerShell, before the first
# `docker compose up`. See docs/DEPLOY_TO_CLIENT_PC.md.

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 leaves $PSScriptRoot empty in param defaults under `powershell -File`
# (how Task Scheduler runs scripts), so resolve the default here.
$scriptFolder = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ProjectPath) { $ProjectPath = Split-Path -Parent $scriptFolder }

if ($Hostname -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') {
    throw "Hostname '$Hostname' is not a plain hostname such as app.example.com (no http://, no slashes, no spaces)."
}
if ($Hostname -in @("localhost", "app.example.com")) {
    throw "Use the client's real hostname, not '$Hostname'."
}

$composeFile = Join-Path $ProjectPath "docker-compose.yml"
$examplePath = Join-Path $ProjectPath ".env.example"
$envPath = Join-Path $ProjectPath ".env"
if (-not (Test-Path $composeFile) -or -not (Test-Path $examplePath)) {
    throw "docker-compose.yml / .env.example not found in '$ProjectPath'. Pass -ProjectPath <folder that contains docker-compose.yml>."
}
if (Test-Path $envPath) {
    throw ".env already exists in '$ProjectPath'. Not overwriting it. Edit it by hand, or move it away first."
}

# 1. Runtime folders (outside the Git repository).
$folders = @(
    "uploads", "logs\api", "logs\proxy", "logs\postgres",
    "backups\postgres", "backups\uploads", "backups\manifests",
    "restore-staging", "operational", "releases"
)
foreach ($folder in $folders) {
    New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeRoot $folder) | Out-Null
}
Write-Host "Runtime folders ready under $RuntimeRoot"

# 2. Strong database password. Letters and digits only, so DATABASE_URL needs no URL-encoding.
$alphabet = [char[]]"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
$bytes = New-Object byte[] 40
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$password = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })

# 3. Tunnel token (tunnel mode only). Read as a secret; never echoed.
$token = ""
if ($Mode -eq "tunnel") {
    $secure = Read-Host "Paste the Cloudflare Tunnel token (input hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if (-not $token.Trim()) { throw "A tunnel token is required in tunnel mode." }
}

# 4. Write .env from .env.example, changing only the values that must differ in production.
$publicHost = if ($Mode -eq "tunnel") { "http://$Hostname" } else { $Hostname }
$user = "inspection_app"
$db = "inspection"
$replacements = [ordered]@{
    "PUBLIC_HOSTNAME"         = $publicHost
    "CLOUDFLARE_TUNNEL_TOKEN" = $token.Trim()
    "POSTGRES_PASSWORD"       = $password
    "DATABASE_URL"            = "postgres://${user}:${password}@postgres:5432/${db}"
}
$lines = Get-Content -Path $examplePath
$seen = @{}
$output = foreach ($line in $lines) {
    $replaced = $false
    foreach ($key in $replacements.Keys) {
        if ($line -match "^$key=") {
            "$key=$($replacements[$key])"
            $seen[$key] = $true
            $replaced = $true
            break
        }
    }
    if (-not $replaced) { $line }
}
foreach ($key in $replacements.Keys) {
    if (-not $seen[$key]) { throw ".env.example has no '$key=' line; the example file changed. Edit .env by hand." }
}
# UTF-8 without BOM so Docker Compose reads the first line correctly.
[System.IO.File]::WriteAllLines($envPath, [string[]]$output, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ".env written to $envPath (private, git-ignored). Hostname mode: $Mode -> PUBLIC_HOSTNAME=$publicHost"
Write-Host "The database password was generated and stored only in .env. Keep a secure copy of .env."
Write-Host ""
Write-Host "Next:"
Write-Host "  docker compose$(if ($Mode -eq 'tunnel') { ' --profile tunnel' }) config --quiet"
Write-Host "  docker compose$(if ($Mode -eq 'tunnel') { ' --profile tunnel' }) up -d --build"

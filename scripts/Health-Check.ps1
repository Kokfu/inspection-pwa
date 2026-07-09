[CmdletBinding()]
param(
    [string]$BaseUrl = "https://localhost",

    # Use this only when checking a real production domain with a trusted certificate.
    [switch]$StrictCertificateCheck
)

$ErrorActionPreference = "Stop"

$BaseUrl = $BaseUrl.TrimEnd("/")
$HealthUrl = "$BaseUrl/api/health"

Write-Host "Checking API health through the reverse proxy..."
Write-Host "URL: $HealthUrl"

# Local Caddy uses a local/self-signed certificate unless its root CA is trusted.
# For localhost validation only, allow curl.exe -k.
# Production checks should use -StrictCertificateCheck with the real HTTPS domain.
$curlArgs = @("-fsS", $HealthUrl)

if (-not $StrictCertificateCheck -and $BaseUrl -match "^https://(localhost|127\.0\.0\.1)(:\d+)?$") {
    $curlArgs = @("-k") + $curlArgs
}

$response = & curl.exe @curlArgs

if ($LASTEXITCODE -ne 0) {
    throw "Health check failed with curl exit code $LASTEXITCODE"
}

Write-Host "Health response:"
Write-Host $response

Write-Host "Health check passed."
param(
    [string]$BaseUrl = "http://localhost"
)

Write-Host "Checking API health through the reverse proxy..."
Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing


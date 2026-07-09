param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$ComposeFile = "docker-compose.yml"
)

Write-Host "Restore skeleton only. Take a pre-restore safety backup before production use."
Write-Host "Backup file: $BackupFile"
Write-Host "Expected restore command will use pg_restore inside the PostgreSQL container."


# Resets local PostgreSQL 14 "postgres" user password.
# Run PowerShell as Administrator:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\scripts\resetPostgresPassword.ps1

param(
  [string]$NewPassword = "postgres",
  [string]$PgHbaPath = "C:\Program Files\PostgreSQL\14\data\pg_hba.conf",
  [string]$PsqlPath = "C:\Program Files\PostgreSQL\14\bin\psql.exe",
  [string]$ServiceName = "postgresql-x64-14"
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Re-run this script in PowerShell as Administrator." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $PgHbaPath)) {
  Write-Host "pg_hba.conf not found at $PgHbaPath" -ForegroundColor Red
  exit 1
}

$backup = "$PgHbaPath.backup-reset"
Copy-Item $PgHbaPath $backup -Force
Write-Host "Backed up pg_hba.conf to $backup"

$content = Get-Content $PgHbaPath -Raw
$temp = $content -replace 'scram-sha-256', 'trust'
Set-Content -Path $PgHbaPath -Value $temp -NoNewline

Restart-Service $ServiceName -Force
Write-Host "Restarted $ServiceName (trust auth enabled temporarily)"

$env:PGPASSWORD = ""
& $PsqlPath -U postgres -h localhost -d postgres -c "ALTER USER postgres WITH PASSWORD '$NewPassword';"

Copy-Item $backup $PgHbaPath -Force
Restart-Service $ServiceName -Force
Write-Host "Restored pg_hba.conf and restarted service."

Write-Host ""
Write-Host "Done. Set in .env:" -ForegroundColor Green
Write-Host "DATABASE_URL=postgresql://postgres:$NewPassword@localhost:5432/sliqpay-programmatic-pages"

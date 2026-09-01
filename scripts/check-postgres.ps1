$ErrorActionPreference = 'Stop'

$postgresRoot = 'C:\Program Files\PostgreSQL'
$versionDirectory = Get-ChildItem -LiteralPath $postgresRoot -Directory -ErrorAction Stop |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1
$psql = Join-Path $versionDirectory.FullName 'bin\psql.exe'

$databaseLine = Get-Content (Join-Path $PSScriptRoot '..\.env') |
    Where-Object { $_ -like 'DATABASE_URL=*' } |
    Select-Object -First 1
if (-not $databaseLine) { throw 'DATABASE_URL is missing from .env.' }

$databaseUrl = $databaseLine.Substring('DATABASE_URL='.Length)
& $psql $databaseUrl -v ON_ERROR_STOP=1 -c "SELECT current_database() AS database, current_user AS role, NOW() AS checked_at;"
if ($LASTEXITCODE -ne 0) { throw 'Northstar could not connect using DATABASE_URL from .env.' }

Write-Host 'PostgreSQL connection is ready for Northstar.' -ForegroundColor Green


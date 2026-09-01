$ErrorActionPreference = 'Stop'

$postgresRoot = 'C:\Program Files\PostgreSQL'
$versionDirectory = Get-ChildItem -LiteralPath $postgresRoot -Directory -ErrorAction Stop |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1

if (-not $versionDirectory) {
    throw 'PostgreSQL was not found under C:\Program Files\PostgreSQL.'
}

$psql = Join-Path $versionDirectory.FullName 'bin\psql.exe'
$createdb = Join-Path $versionDirectory.FullName 'bin\createdb.exe'
if (-not (Test-Path -LiteralPath $psql) -or -not (Test-Path -LiteralPath $createdb)) {
    throw "PostgreSQL client tools were not found in $($versionDirectory.FullName)."
}

Write-Host "Using PostgreSQL $($versionDirectory.Name) at localhost:5432" -ForegroundColor Cyan
$securePassword = Read-Host 'Enter the postgres administrator password chosen during installation' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    & $psql -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT version();"
    if ($LASTEXITCODE -ne 0) { throw 'Could not authenticate as the postgres administrator.' }

    $roleExists = & $psql -h localhost -p 5432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'northstar';"
    if ($roleExists.Trim() -eq '1') {
        & $psql -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE northstar WITH LOGIN PASSWORD 'northstar';"
    } else {
        & $psql -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE northstar WITH LOGIN PASSWORD 'northstar';"
    }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create or update the northstar role.' }

    $databaseExists = & $psql -h localhost -p 5432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'northstar';"
    if ($databaseExists.Trim() -ne '1') {
        & $createdb -h localhost -p 5432 -U postgres -O northstar northstar
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the northstar database.' }
    }

    & $psql -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE northstar OWNER TO northstar;"
    if ($LASTEXITCODE -ne 0) { throw 'Could not assign the northstar database owner.' }

    Write-Host 'Northstar role and database are ready.' -ForegroundColor Green
    Write-Host 'Run npm run db:check, then npm run dev.' -ForegroundColor Green
} finally {
    $env:PGPASSWORD = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}


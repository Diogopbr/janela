param([switch]$Test)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
$toolsPath = Join-Path (Split-Path $repoPath -Parent) '.tools/node'
$env:PATH = $toolsPath + ';' + $env:PATH
$settingsPath = Join-Path $repoPath '.local/settings.json'
if (-not (Test-Path -LiteralPath $settingsPath)) { throw 'Run scripts/bootstrap.ps1 or provide your own PostgreSQL environment.' }
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$databaseName = if ($Test) { $settings.testDatabase } else { $settings.database }
$databaseRole = if ($Test) { $settings.testUsername } else { $settings.username }
$databasePassword = if ($Test) { $settings.testPassword } else { $settings.password }
$env:DATABASE_URL = 'postgresql://' + [Uri]::EscapeDataString($databaseRole) + ':' + [Uri]::EscapeDataString($databasePassword) + '@' + $settings.host + ':' + $settings.port + '/' + $databaseName
$env:NODE_ENV = if ($Test) { 'test' } else { 'development' }
$env:DB_TLS = 'false'
$env:SESSION_SECRET = $settings.sessionSecret
$env:APP_URL = if ($Test) { 'http://127.0.0.1:5093' } else { 'http://127.0.0.1:5091' }
$env:PORT = if ($Test) { '5093' } else { '5091' }
$env:JANELA_DEMO_ENABLED = 'true'
$env:JANELA_LOGIN_ENABLED = 'false'
$env:JANELA_VERCEL_INGRESS = 'false'
if ($Test) { $env:JANELA_TEST_DATABASE_URL = $env:DATABASE_URL } else { Remove-Item Env:JANELA_TEST_DATABASE_URL -ErrorAction SilentlyContinue }

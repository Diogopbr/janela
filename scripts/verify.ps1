param()
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
Push-Location $repoPath
try {
  . (Join-Path $PSScriptRoot 'local-env.ps1') -Test
  function Run-Check([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program verification failed with exit code $LASTEXITCODE" }
  }
  Run-Check 'npm' @('run','typecheck')
  Run-Check 'npm' @('run','format:check')
  Run-Check 'npm' @('test')
  Run-Check 'npm' @('run','test:frontend')
  Run-Check 'npm' @('run','build')
  Run-Check 'npm' @('run','migrate')
  Run-Check 'npm' @('run','test:e2e')
  Run-Check 'git' @('diff','--check')
} finally { Pop-Location }

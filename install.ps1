$ErrorActionPreference = "Stop"

# Get absolute path to the GenOS repository
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $HOME ".genos\bin"

Write-Host "Building GenOS release binaries..."
Set-Location $RepoRoot
cargo build --release --workspace

Write-Host "Creating global bin directory at $BinDir..."
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

$GenosExe = Join-Path $RepoRoot "target\release\genos.exe"
$McpExe = Join-Path $RepoRoot "target\release\genos-mcp.exe"
$OrchestratorBridge = Join-Path $RepoRoot "backend\bin\genos-orchestrate.cjs"

Write-Host "Generating wrappers..."

$GenosBat = Join-Path $BinDir "genos.bat"
@"
@echo off
set GENOS_ORCHESTRATOR_BRIDGE=$OrchestratorBridge
"$GenosExe" %*
"@ | Out-File -FilePath $GenosBat -Encoding utf8

$McpBat = Join-Path $BinDir "genos-mcp.bat"
@"
@echo off
set GENOS_ORCHESTRATOR_BRIDGE=$OrchestratorBridge
set GENOS_BIN=$GenosExe
"$McpExe" %*
"@ | Out-File -FilePath $McpBat -Encoding utf8

$GenosPs1 = Join-Path $BinDir "genos.ps1"
@"
`$env:GENOS_ORCHESTRATOR_BRIDGE = "$OrchestratorBridge"
& "$GenosExe" `$args
"@ | Out-File -FilePath $GenosPs1 -Encoding utf8

$McpPs1 = Join-Path $BinDir "genos-mcp.ps1"
@"
`$env:GENOS_ORCHESTRATOR_BRIDGE = "$OrchestratorBridge"
`$env:GENOS_BIN = "$GenosExe"
& "$McpExe" `$args
"@ | Out-File -FilePath $McpPs1 -Encoding utf8

Write-Host "`n✅ Installation complete!" -ForegroundColor Green
Write-Host "The executables have been installed to: $BinDir"
Write-Host "`nPlease ensure that $BinDir is in your system or user PATH environment variable."
Write-Host "You can add it by running:"
Write-Host "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';$BinDir', 'User')"
Write-Host "`nAfter updating your PATH, restart your terminal, and you can run 'genos' and 'genos-mcp' from anywhere."

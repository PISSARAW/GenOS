$ErrorActionPreference = "Stop"

# Get absolute path to the GenOS repository
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $HOME ".genos\bin"

Write-Host "Building GenOS release binaries..."
Set-Location $RepoRoot

Write-Host "Installing backend dependencies..."
Set-Location "$RepoRoot\backend"
npm install

Write-Host "Building GenOS Studio..."
Set-Location "$RepoRoot\studio"
npm install
npm run build

Set-Location $RepoRoot
cargo build --release --workspace

Write-Host "Creating global bin directory at $BinDir..."
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

$GenosExe = Join-Path $RepoRoot "target\release\genos.exe"
$McpExe = Join-Path $RepoRoot "target\release\genos-mcp.exe"
$OrchestratorBridge = Join-Path $RepoRoot "scripts\orchestrator_cli.mjs"

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

Write-Host "Adding $BinDir to your user PATH..."
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$UserPath;$BinDir", 'User')
    Write-Host "PATH updated."
} else {
    Write-Host "PATH already contains $BinDir, skipping."
}

# Make genos available immediately in the current session
if ($env:Path -notlike "*$BinDir*") {
    $env:Path += ";$BinDir"
}

Write-Host "`n✅ Installation complete!" -ForegroundColor Green
Write-Host "The executables have been installed to: $BinDir"
Write-Host "They are usable right now in this session. Open a new terminal elsewhere and 'genos' and 'genos-mcp' will also be available from anywhere."

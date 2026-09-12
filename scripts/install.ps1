# GenOS Installation & Build Script for Windows PowerShell
# Builds and installs GenOS CLI, MCP Server, Quantum VFS, and Backend services.
param (
    [switch]$SkipTests = $false,
    [switch]$Release = $true
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $RepoRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  GenOS v3 — Installation & Configuration Complète" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verification of prerequisites
Write-Host "`n1. Vérification des prérequis système..." -ForegroundColor Yellow
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargo) {
    throw "Cargo/Rust est introuvable. Veuillez installer Rust via https://rustup.rs"
}
Write-Host "  [OK] Rust/Cargo détecté : $(& cargo --version)" -ForegroundColor Green

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js est introuvable. Veuillez installer Node.js >= 18."
}
Write-Host "  [OK] Node.js détecté : $(& node --version)" -ForegroundColor Green

# 2. Backend dependencies
Write-Host "`n2. Installation des dépendances Node.js du Backend..." -ForegroundColor Yellow
if (Test-Path "$RepoRoot\backend\package.json") {
    npm --prefix "$RepoRoot\backend" install --silent
    Write-Host "  [OK] Dépendances backend installées." -ForegroundColor Green
}

# 3. Rust Workspace Compilation
$buildMode = if ($Release) { "--release" } else { "" }
Write-Host "`n3. Compilation de l'espace de travail Rust ($($buildMode ? 'Release' : 'Debug'))..." -ForegroundColor Yellow
if ($Release) {
    cargo build --release --workspace
} else {
    cargo build --workspace
}
Write-Host "  [OK] Binaires Rust compilés avec succès (genos, genos-mcp, g, genos-api)." -ForegroundColor Green

# 4. Run Quantum VFS Validation Suite
if (-not $SkipTests) {
    Write-Host "`n4. Exécution du banc d'essai Quantum VFS & MCP..." -ForegroundColor Yellow
    node "$RepoRoot\backend\tests\test_quantum_vfs_decoherence.js"
    node "$RepoRoot\backend\tests\test_quantum_vfs_wiring.js"
    cargo test -q -p genos-mcp
    Write-Host "  [OK] Tous les tests de validation ont réussi." -ForegroundColor Green
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  INSTALLATION DE GENOS TERMINÉE AVEC SUCCÈS !" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Commandes disponibles :"
Write-Host "    - CLI Native   : target\release\genos.exe --help"
Write-Host "    - Quantum VFS  : target\release\genos.exe quantum-vfs --help"
Write-Host "    - MCP Server   : target\release\genos-mcp.exe"
Write-Host "============================================================`n" -ForegroundColor Green

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

Write-Host "1. Building GenOS binaries in Release mode..." -ForegroundColor Cyan
cargo build --release --workspace

Write-Host "2. Checking for Inno Setup compiler..." -ForegroundColor Cyan
$ISCC = ""
$isccPaths = @(
    "${env:LocalAppdata}\Programs\Inno Setup 7\ISCC.exe",
    "${env:LocalAppdata}\Programs\Inno Setup 6\ISCC.exe",
    "${env:LocalAppdata}\Programs\Inno Setup\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup\ISCC.exe"
)

foreach ($p in $isccPaths) {
    if (Test-Path $p) {
        $ISCC = $p
        break
    }
}

if ($ISCC -eq "") {
    Write-Error "Inno Setup compiler (ISCC.exe) non trouvé ! Veuillez vérifier votre installation."
    exit 1
}

Write-Host "Using compiler: $ISCC" -ForegroundColor Green
Write-Host "3. Compiling GenOS-Setup.exe installer..." -ForegroundColor Cyan
& $ISCC deploy\windows\genos-installer.iss

Write-Host "`n✅ Succès ! L'installeur est disponible dans deploy\windows\Output\GenOS-Setup.exe" -ForegroundColor Green

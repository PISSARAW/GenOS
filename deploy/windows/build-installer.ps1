$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $RepoRoot

$openSslLib = if ($env:OPENSSL_LIB_DIR) {
    $env:OPENSSL_LIB_DIR
} elseif ($env:OPENSSL_DIR) {
    Join-Path $env:OPENSSL_DIR "lib\VC\x64\MD"
} else {
    "C:\Program Files\OpenSSL-Win64\lib\VC\x64\MD"
}
if (Test-Path $openSslLib) {
    $env:LIB = "$openSslLib;" + $env:LIB
}
cargo build --release --workspace

$releaseDir = Join-Path $RepoRoot "target\release"
$expectedBinaries = @("g.exe", "genos.exe", "genos-mcp.exe", "genos-api.exe")
foreach ($binary in $expectedBinaries) {
    $binPath = Join-Path $releaseDir $binary
    if (-not (Test-Path $binPath)) {
        Write-Error "Expected release artifact missing: $binary"
        exit 1
    }
    Write-Host "  -> Found artifact: $binary" -ForegroundColor Green
}

Write-Host "`n2. Checking for Inno Setup compiler..." -ForegroundColor Cyan
$ISCC = ""
$isccPaths = @(
    "${env:ProgramFiles}\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup\ISCC.exe",
    "${env:LocalAppdata}\Programs\Inno Setup 7\ISCC.exe",
    "${env:LocalAppdata}\Programs\Inno Setup 6\ISCC.exe",
    "${env:LocalAppdata}\Programs\Inno Setup\ISCC.exe"
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
Write-Host "`n3. Compiling GenOS-V3-Setup.exe installer..." -ForegroundColor Cyan
& $ISCC "$RepoRoot\deploy\windows\genos-installer.iss"

$outputInstaller = Join-Path $RepoRoot "deploy\windows\Output\GenOS-V3-Setup.exe"
if (Test-Path $outputInstaller) {
    $item = Get-Item $outputInstaller
    $hash = Get-FileHash -Path $outputInstaller -Algorithm SHA256
    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host "  GENOS V3 WINDOWS INSTALLER GENERATED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  Emplacement : $($item.FullName)"
    Write-Host "  Taille      : $([math]::Round($item.Length / 1MB, 2)) MB ($($item.Length) octets)"
    Write-Host "  SHA256      : $($hash.Hash)"
    Write-Host "============================================================`n" -ForegroundColor Green
} else {
    Write-Error "L'installeur n'a pas été généré dans $outputInstaller"
    exit 1
}

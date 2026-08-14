$ErrorActionPreference = "Stop"

$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargoCommand) {
    $cargoFromRustup = Join-Path $env:USERPROFILE ".cargo\\bin\\cargo.exe"
    if (Test-Path $cargoFromRustup) {
        $env:Path = "$(Split-Path $cargoFromRustup);$env:Path"
        $cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
    }
}

if (-not $cargoCommand) {
    throw "cargo introuvable. Installe Rust via rustup (https://rustup.rs) puis ouvre un nouveau terminal PowerShell."
}

$scriptPath = Join-Path $PSScriptRoot "examples/counterfactual-demo/run-demo.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "Script not found: $scriptPath"
}

& $scriptPath

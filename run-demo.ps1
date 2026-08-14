$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "examples/counterfactual-demo/run-demo.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "Script not found: $scriptPath"
}

& $scriptPath

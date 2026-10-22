#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    $proofs = @(
        @{ Name = 'Biology and nosology contracts'; Command = 'cargo'; Args = @('test', '-p', 'genos-biology', '--lib', '--tests', '--jobs', '1') },
        @{ Name = 'Persistent authorization'; Command = 'cargo'; Args = @('test', '-p', 'genos-orchestrator', '--features', 'api', '--test', 'nosology_authorization', '--jobs', '1') },
        @{ Name = 'CLI clinical reservation'; Command = 'cargo'; Args = @('test', '--workspace', '--bin', 'genos', 'commands::biomimicry::therapy::tests', '--offline', '--jobs', '1') },
        @{ Name = 'Clinical authorization and revocation'; Command = 'npm'; Args = @('--prefix', 'backend', 'run', 'test:clinical-authorization') },
        @{ Name = 'CLI reservation race and crash recovery'; Command = 'npm'; Args = @('--prefix', 'backend', 'run', 'test:clinical-revocation-cli-e2e') },
        @{ Name = 'HTTP to Rust receipt and restart'; Command = 'npm'; Args = @('--prefix', 'backend', 'run', 'test:clinical-rust-e2e') },
        @{ Name = 'Nosology backend catalog'; Command = 'node'; Args = @('backend/tests/test_nosology_catalog.js') },
        @{ Name = 'Consumer inspection'; Command = 'node'; Args = @('backend/tests/test_consumer_inspection.js') },
        @{ Name = 'MCP lease enforcement'; Command = 'npm'; Args = @('--prefix', 'backend', 'run', 'test:mcp') },
        @{ Name = 'Generated runtime catalog'; Command = 'node'; Args = @('scripts/docs/generate-nosology-catalog.mjs', '--check') },
        @{ Name = 'ADR index'; Command = 'python'; Args = @('scripts/ci/check_adr_index.py') },
        @{ Name = 'Repository code quality'; Command = 'python'; Args = @('scripts/ci/check_code_quality.py') }
    )

    foreach ($proof in $proofs) {
        Write-Host "`n== $($proof.Name) =="
        $proofArgs = $proof.Args
        & $proof.Command @proofArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Proof failed (exit $LASTEXITCODE): $($proof.Name)"
        }
    }
} finally {
    Pop-Location
}

$ErrorActionPreference = 'Stop'

if ($env:OS -eq 'Windows_NT') {
  if (-not $env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS = '1' }
  $nasm = Get-Command nasm -ErrorAction SilentlyContinue
  if (-not $nasm -and -not $env:AWS_LC_SYS_NO_ASM) {
    if ($args -contains '--release') {
      throw 'NASM est requis pour un build Rust release Windows; installez NASM ou utilisez le runner CI.'
    }
    $env:AWS_LC_SYS_NO_ASM = '1'
    Write-Warning 'NASM absent: AWS_LC_SYS_NO_ASM=1 active pour le profil debug/test uniquement.'
  }
}

& cargo test @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

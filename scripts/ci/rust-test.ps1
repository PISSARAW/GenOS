$ErrorActionPreference = 'Stop'

function commandAvailable([string] $name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function rustHostIsMsvc() {
  $rustInfo = (& rustc -vV | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'rustc est requis pour le preflight Rust.' }
  return $rustInfo -match 'host: .*windows-msvc'
}

if ($env:OS -eq 'Windows_NT') {
  if (-not $env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS = '1' }
  if ((rustHostIsMsvc) -and -not (commandAvailable 'cl.exe')) {
    throw 'Le toolchain Rust windows-msvc est actif mais cl.exe est introuvable. Ouvrez le Developer PowerShell Visual Studio ou installez les Build Tools MSVC.'
  }
  $nasm = Get-Command nasm -ErrorAction SilentlyContinue
  $explicitNoAsm = $env:AWS_LC_SYS_NO_ASM -eq '1'
  $allowNoNasm = $env:GENOS_ALLOW_NO_NASM -eq '1'
  if (-not $nasm -and $args -contains '--release') {
    throw 'NASM est requis pour un build Rust release Windows; installez NASM avant de relancer.'
  }
  if (-not $nasm -and -not $explicitNoAsm) {
    if (-not $allowNoNasm) {
      throw 'NASM est requis pour ce build Rust Windows. Installez NASM; pour un test debug explicitement limite, utilisez GENOS_ALLOW_NO_NASM=1.'
    }
    $env:AWS_LC_SYS_NO_ASM = '1'
    Write-Warning 'NASM absent: AWS_LC_SYS_NO_ASM=1 active par opt-in pour le profil debug/test uniquement.'
  }
}

& cargo test @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ErrorActionPreference = 'Stop'

function commandAvailable([string] $name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function findVsDevCmd() {
  $vswhere = Get-Command 'vswhere.exe' -ErrorAction SilentlyContinue
  if (-not $vswhere) {
    $candidate = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $candidate) { $vswhere = Get-Item $candidate }
  }
  if (-not $vswhere) { return $null }
  $vswherePath = if ($vswhere.Path) { $vswhere.Path } else { $vswhere.FullName }
  $installation = & $vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1
  if (-not $installation) { return $null }
  $devCmd = Join-Path $installation.Trim() 'Common7\Tools\VsDevCmd.bat'
  if (Test-Path $devCmd) { return $devCmd }
  return $null
}

function importMsvcEnvironment() {
  if (commandAvailable 'cl.exe') { return $true }
  $devCmd = findVsDevCmd
  if (-not $devCmd) { return $false }
  $environment = & cmd.exe /d /s /c ('call "{0}" -arch=x64 -host_arch=x64 >nul && set' -f $devCmd)
  foreach ($line in $environment) {
    if ($line -match '^([^=]+)=(.*)$') { Set-Item -Path ("Env:{0}" -f $matches[1]) -Value $matches[2] }
  }
  return commandAvailable 'cl.exe'
}

function rustHostIsMsvc() {
  $rustInfo = (& rustc -vV | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'rustc est requis pour le preflight Rust.' }
  return $rustInfo -match 'host: .*windows-msvc'
}

if ($env:OS -eq 'Windows_NT') {
  if (-not $env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS = '1' }
  if ((rustHostIsMsvc) -and -not (importMsvcEnvironment)) {
    throw 'Le toolchain Rust windows-msvc est actif mais cl.exe est introuvable. Installez les Build Tools MSVC (composant Microsoft.VisualStudio.Component.VC.Tools.x86.x64) ou ouvrez un Developer PowerShell Visual Studio.'
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

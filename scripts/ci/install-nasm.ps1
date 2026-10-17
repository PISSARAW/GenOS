param(
  [switch] $Install,
  [ValidateSet('auto', 'winget', 'choco')]
  [string] $PackageManager = 'auto',
  [switch] $Yes,
  [switch] $PersistPath
)

$ErrorActionPreference = 'Stop'

function Get-NasmCandidates {
  $paths = [System.Collections.Generic.List[string]]::new()
  $command = Get-Command nasm.exe -ErrorAction SilentlyContinue
  if ($command) { [void] $paths.Add($command.Source) }

  $directories = [System.Collections.Generic.List[string]]::new()
  if ($env:ProgramFiles) { [void] $directories.Add((Join-Path $env:ProgramFiles 'NASM')) }
  if (${env:ProgramFiles(x86)}) { [void] $directories.Add((Join-Path ${env:ProgramFiles(x86)} 'NASM')) }
  if ($env:LOCALAPPDATA) { [void] $directories.Add((Join-Path $env:LOCALAPPDATA 'Programs\NASM')) }
  if ($env:ChocolateyInstall) { [void] $directories.Add((Join-Path $env:ChocolateyInstall 'bin')) }
  [void] $directories.Add('C:\ProgramData\chocolatey\bin')
  foreach ($directory in $directories) {
    $candidate = Join-Path $directory 'nasm.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { [void] $paths.Add($candidate) }
  }

  $paths | Where-Object { $_ } | ForEach-Object { (Resolve-Path -LiteralPath $_).Path } |
    Select-Object -Unique
}

function Refresh-ProcessPath {
  if ($env:OS -ne 'Windows_NT') { return }
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $segments = @($machinePath, $userPath, $env:Path) -split ';' |
    Where-Object { $_ -and $_.Trim() } | Select-Object -Unique
  $env:Path = $segments -join ';'
}

function Add-UserPath([string] $directory) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $segments = @($current -split ';' | Where-Object { $_ -and $_.Trim() })
  if ($segments -contains $directory) { return }
  $updated = (@($segments + $directory) | Select-Object -Unique) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
  Refresh-ProcessPath
}

function Get-NasmReport {
  $path = Get-NasmCandidates | Select-Object -First 1
  if (-not $path) {
    return [pscustomobject]@{ available = $false; path = $null; version = $null }
  }

  $versionOutput = (& $path -v 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    return [pscustomobject]@{ available = $false; path = $path; version = $null }
  }

  [pscustomobject]@{
    available = $true
    path = $path
    version = $versionOutput
  }
}

function Select-PackageManager([string] $requested) {
  if ($requested -ne 'auto') {
    if (-not (Get-Command $requested -ErrorAction SilentlyContinue)) {
      throw "Le gestionnaire '$requested' est introuvable. Installez-le ou choisissez -PackageManager auto."
    }
    return $requested
  }

  if (Get-Command winget.exe -ErrorAction SilentlyContinue) { return 'winget' }
  if (Get-Command choco.exe -ErrorAction SilentlyContinue) { return 'choco' }
  throw 'Aucun gestionnaire disponible. Installez winget ou Chocolatey, puis relancez avec -Install.'
}

function Install-Nasm([string] $manager) {
  if ($manager -eq 'winget') {
    & winget.exe install --id NASM.NASM --exact --source winget --accept-source-agreements --accept-package-agreements
  } else {
    & choco.exe install nasm --yes --no-progress
  }
  if ($LASTEXITCODE -ne 0) { throw "L'installation de NASM via $manager a échoué (code $LASTEXITCODE)." }
}

$before = Get-NasmReport
if ($before.available) {
  if ($PersistPath -and $Yes) {
    Add-UserPath (Split-Path -Parent $before.path)
    $before = Get-NasmReport
  } elseif ($PersistPath) {
    throw 'La persistance du PATH exige une confirmation explicite avec -Yes.'
  }
  $before | ConvertTo-Json -Compress
  exit 0
}

if (-not $Install) {
  Write-Error 'NASM est absent. Vérifiez avec .\scripts\ci\install-nasm.ps1 -Install -Yes; aucune installation automatique n est lancée sans -Install.'
  exit 2
}
if (-not $Yes) {
  throw 'Installation demandée mais non confirmée. Ajoutez -Yes pour autoriser explicitement le gestionnaire de paquets choisi.'
}

$manager = Select-PackageManager $PackageManager
Write-Host "Installation explicite de NASM via $manager."
Install-Nasm $manager

Refresh-ProcessPath
$after = Get-NasmReport
if (-not $after.available) {
  $candidate = Get-NasmCandidates | Select-Object -First 1
  if ($candidate) {
    $directory = Split-Path -Parent $candidate
    $env:Path = "$directory;$env:Path"
    if ($PersistPath) { Add-UserPath $directory }
    $after = Get-NasmReport
  }
}
if (-not $after.available) {
  throw 'NASM reste introuvable après installation. Relancez PowerShell ou utilisez -PersistPath -Yes pour enregistrer explicitement le dossier détecté dans le PATH utilisateur.'
}
$after | ConvertTo-Json -Compress

param(
  [switch] $Install,
  [ValidateSet('auto', 'winget', 'choco')]
  [string] $PackageManager = 'auto',
  [switch] $Yes
)

$ErrorActionPreference = 'Stop'

function Get-NasmReport {
  $command = Get-Command nasm.exe -ErrorAction SilentlyContinue
  if (-not $command) {
    return [pscustomobject]@{ available = $false; path = $null; version = $null }
  }

  $versionOutput = (& $command.Source -v 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    return [pscustomobject]@{ available = $false; path = $command.Source; version = $null }
  }

  [pscustomobject]@{
    available = $true
    path = $command.Source
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

$after = Get-NasmReport
if (-not $after.available) {
  throw 'NASM reste introuvable après installation. Ouvrez un nouveau terminal ou ajoutez son dossier au PATH, puis relancez le préflight.'
}
$after | ConvertTo-Json -Compress

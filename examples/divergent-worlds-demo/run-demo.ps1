$ErrorActionPreference = "Stop"

$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargoCommand) {
	$cargoFromRustup = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
	if (Test-Path $cargoFromRustup) {
		$env:Path = "$(Split-Path $cargoFromRustup);$env:Path"
		$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
	}
}

if (-not $cargoCommand) {
	throw "cargo introuvable. Installe Rust via rustup (https://rustup.rs) puis ouvre un nouveau terminal PowerShell."
}

function Invoke-Cargo {
	param(
		[Parameter(ValueFromRemainingArguments = $true)]
		[string[]]$CargoArgs
	)

	& cargo @CargoArgs
	if ($LASTEXITCODE -ne 0) {
		throw "cargo command failed: cargo $($CargoArgs -join ' ')"
	}
}

function Invoke-Genos {
	param(
		[Parameter(ValueFromRemainingArguments = $true)]
		[string[]]$GenosArgs
	)

	Invoke-Cargo -CargoArgs (@("run", "--quiet", "-p", "genos-cli", "--") + $GenosArgs)
}

# Same call, but the JSON is echoed *and* returned so ids can feed the next step.
function Invoke-GenosJson {
	param(
		[Parameter(ValueFromRemainingArguments = $true)]
		[string[]]$GenosArgs
	)

	$output = & cargo run --quiet -p genos-cli -- @GenosArgs
	if ($LASTEXITCODE -ne 0) {
		throw "genos command failed: genos $($GenosArgs -join ' ')"
	}

	$text = $output -join "`n"
	Write-Host $text
	$text | ConvertFrom-Json
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot

try {
	$demoDir = ".genos/demo/divergent-worlds"
	$worldRoot = "$demoDir/world"

	if (Test-Path $demoDir) {
		Remove-Item -Recurse -Force $demoDir
	}
	New-Item -ItemType Directory -Path $demoDir | Out-Null

	Write-Host "[0/6] build the genos CLI"
	Invoke-Cargo -CargoArgs @("build", "-p", "genos-cli")

	Write-Host "[1/6] create the parent world W0"
	$parent = (Invoke-GenosJson world create --provider directory --root $worldRoot --format json).world_id

	Write-Host "[2/6] seed hello.txt = hello, then snapshot W0"
	Invoke-Genos world write-file --provider directory --root $worldRoot `
		--world-id $parent --path hello.txt --contents hello --format json
	$snapshot = (Invoke-GenosJson world snapshot --provider directory --root $worldRoot `
		--world-id $parent --format json).snapshot_id

	Write-Host "[3/6] fork the snapshot into two worlds A and B"
	$worlds = (Invoke-GenosJson world fork --provider directory --root $worldRoot `
		--snapshot-id $snapshot --count 2 --format json).world_ids
	$worldA = $worlds[0]
	$worldB = $worlds[1]

	Write-Host "[4/6] A writes bonjour, B writes hola"
	Invoke-Genos world write-file --provider directory --root $worldRoot `
		--world-id $worldA --path hello.txt --contents bonjour --format json
	Invoke-Genos world write-file --provider directory --root $worldRoot `
		--world-id $worldB --path hello.txt --contents hola --format json

	Write-Host "[5/6] assert A=bonjour, B=hola, W0=hello"
	Invoke-Genos world check-file --provider directory --root $worldRoot `
		--path hello.txt `
		--parent $parent --expect-parent hello `
		--branch $worldA --expect bonjour `
		--branch $worldB --expect hola `
		--expect-isolated `
		--format json

	Write-Host "[6/6] assert the snapshot never absorbed either write"
	# A world forked from S0 *after* both writes must still materialize the
	# original contents, so the divergence stayed in the child worlds.
	$lateWorld = (Invoke-GenosJson world fork --provider directory --root $worldRoot `
		--snapshot-id $snapshot --count 1 --format json).world_ids[0]
	Invoke-Genos world check-file --provider directory --root $worldRoot `
		--path hello.txt `
		--parent $lateWorld --expect-parent hello `
		--branch $worldA --expect bonjour `
		--branch $worldB --expect hola `
		--expect-isolated `
		--format json
	Invoke-Genos world diff --provider directory --root $worldRoot `
		--world-a $worldA --world-b $worldB --format json
	Invoke-Genos world diff --provider directory --root $worldRoot `
		--world-a $parent --world-b $worldA --format json

	Write-Host ""
	Write-Host "Demo OK: W0(hello) -> A(bonjour) | B(hola)"
	Write-Host "world_root=$worldRoot"
	Write-Host "parent_w0=$parent"
	Write-Host "snapshot_s0=$snapshot"
	Write-Host "world_a=$worldA"
	Write-Host "world_b=$worldB"
}
finally {
	Pop-Location
}

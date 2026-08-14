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

	Invoke-Cargo run --quiet -p genos-cli -- @GenosArgs
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot

try {
	$demoDir = ".genos/demo/clone-without-llm"
	$snapshotStore = "$demoDir/agent-snapshots.jsonl"
	$eventStore = "$demoDir/agent-events.jsonl"
	$agentPath = "$demoDir/agent-a.json"
	$s0Path = "$demoDir/snapshot-s0.json"
	$forkDir = "$demoDir/forks"
	$a1Path = "$forkDir/fork-1.json"
	$a2Path = "$forkDir/fork-2.json"

	if (Test-Path $demoDir) {
		Remove-Item -Recurse -Force $demoDir
	}
	New-Item -ItemType Directory -Path $demoDir | Out-Null

	Write-Host "[0/6] build the genos CLI"
	Invoke-Cargo build -p genos-cli

	Write-Host "[1/6] init + create agent A"
	Invoke-Genos init
	Invoke-Genos agent create --name clone-no-llm --role tester --out $agentPath --format json

	Write-Host "[2/6] create snapshot S0 with a minimal seeded memory"
	Invoke-Genos snapshot create `
		--agent $agentPath `
		--out $s0Path `
		--memory seed_note=minimal-memory `
		--semantic-ref memory-minimal-1 `
		--format json
	Invoke-Genos snapshot save --snapshot $s0Path --store $snapshotStore --format json

	Write-Host "[3/6] fork A1 and A2 from S0 (no LLM call, no JSON editing)"
	Invoke-Genos agent fork-from-snapshot `
		--snapshot $s0Path `
		--count 2 `
		--out-dir $forkDir `
		--snapshots $snapshotStore `
		--save `
		--events $eventStore `
		--emit-events `
		--format json

	Write-Host "[4/6] assert same logical state and distinct identity"
	Invoke-Genos snapshot compare `
		--a $a1Path `
		--b $a2Path `
		--expect-same-state `
		--expect-distinct-identity `
		--format json

	# Nothing was modified after the fork, so the structural diff must be empty
	# even though every identity field differs. This is the baseline the diff
	# semantics are defined against.
	Write-Host "[5/6] assert the diff between the untouched forks is empty"
	Invoke-Genos diff $a1Path $a2Path --expect-empty --format json

	Write-Host "[6/6] assert isolated event streams via replay"
	Invoke-Genos replay basic --events $eventStore --snapshot $a1Path --expect-last-sequence 1 --format json
	Invoke-Genos replay basic --events $eventStore --snapshot $a2Path --expect-last-sequence 1 --format json

	Write-Host ""
	Write-Host "Demo OK: Agent A -> snapshot S0 -> forks A1/A2"
	Write-Host "snapshot_store=$snapshotStore"
	Write-Host "event_store=$eventStore"
	Write-Host "fork_a1=$a1Path"
	Write-Host "fork_a2=$a2Path"
}
finally {
	Pop-Location
}

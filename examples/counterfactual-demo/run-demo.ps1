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
	$a2ExplorePath = "$forkDir/fork-2-explore.json"

	if (Test-Path $demoDir) {
		Remove-Item -Recurse -Force $demoDir
	}
	New-Item -ItemType Directory -Path $demoDir | Out-Null

	Write-Host "[0/7] build the genos CLI"
	Invoke-Cargo -CargoArgs @("build", "-p", "genos-cli")

	Write-Host "[1/7] init + create agent A"
	Invoke-Genos init
	Invoke-Genos agent create --name clone-no-llm --role tester --out $agentPath --format json

	Write-Host "[2/7] create snapshot S0 with a minimal seeded memory"
	Invoke-Genos snapshot create `
		--agent $agentPath `
		--out $s0Path `
		--memory seed_note=minimal-memory `
		--semantic-ref memory-minimal-1 `
		--format json
	Invoke-Genos snapshot save --snapshot $s0Path --store $snapshotStore --format json

	Write-Host "[3/7] fork A1 and A2 from S0 (no LLM call, no JSON editing)"
	Invoke-Genos agent fork-from-snapshot `
		--snapshot $s0Path `
		--count 2 `
		--out-dir $forkDir `
		--snapshots $snapshotStore `
		--save `
		--events $eventStore `
		--emit-events `
		--format json

	Write-Host "[4/7] assert same logical state and distinct identity"
	Invoke-Genos snapshot compare `
		--a $a1Path `
		--b $a2Path `
		--expect-same-state `
		--expect-distinct-identity `
		--format json

	# Nothing was modified after the fork, so the structural diff must be empty
	# even though every identity field differs. This is the baseline the diff
	# semantics are defined against.
	Write-Host "[5/7] assert the diff between the untouched forks is empty"
	Invoke-Genos diff $a1Path $a2Path --expect-empty --format json

	# One value changed on one fork, and the diff names that value: the report
	# is a path with an old and a new, not a re-dump of the genome. A1 keeps the
	# default exploration of 0.7 and fork-2.json itself is left untouched, so
	# the replay below still sees the forks the CLI produced.
	Write-Host "[6/7] change exactly one genome value on A2 and diff again"
	Invoke-Genos snapshot set-cognition --snapshot $a2Path --drive exploration=0.8 --out $a2ExplorePath --format json
	Invoke-Genos diff $a1Path $a2ExplorePath `
		--expect-changed-path 'genome.cognition.chromosomes[0].loci[0].value' `
		--format text

	Write-Host "[7/7] assert isolated event streams via replay"
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

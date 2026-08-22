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

function Get-SnapshotId {
	param([string]$Path)

	(Get-Content -Raw $Path | ConvertFrom-Json).snapshot_id
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot

try {
	$demoDir = ".genos/demo/divergent-writes"
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

	Write-Host "[0/8] build the genos CLI"
	Invoke-Cargo -CargoArgs @("build", "-p", "genos-cli")

	Write-Host "[1/8] init + create agent A"
	Invoke-Genos init
	Invoke-Genos agent create --name divergent-writes --role tester --out $agentPath --format json

	Write-Host "[2/8] create snapshot S0 with counter=0"
	Invoke-Genos snapshot create `
		--agent $agentPath `
		--out $s0Path `
		--memory counter=0 `
		--format json
	Invoke-Genos snapshot save --snapshot $s0Path --store $snapshotStore --format json

	Write-Host "[3/8] fork A1 and A2 from S0 (no LLM call, no JSON editing)"
	Invoke-Genos agent fork-from-snapshot `
		--snapshot $s0Path `
		--count 2 `
		--out-dir $forkDir `
		--snapshots $snapshotStore `
		--save `
		--format json

	Write-Host "[4/8] each branch writes counter differently"
	Invoke-Genos snapshot set-var `
		--snapshot $a1Path `
		--key counter `
		--value 10 `
		--snapshots $snapshotStore `
		--save `
		--events $eventStore `
		--emit-events `
		--format json
	Invoke-Genos snapshot set-var `
		--snapshot $a2Path `
		--key counter `
		--value 20 `
		--snapshots $snapshotStore `
		--save `
		--events $eventStore `
		--emit-events `
		--format json

	Write-Host "[5/8] assert A1.counter=10, A2.counter=20, S0.counter=0"
	Invoke-Genos snapshot check-var `
		--key counter `
		--parent $s0Path --expect-parent 0 `
		--branch $a1Path --expect 10 `
		--branch $a2Path --expect 20 `
		--expect-isolated `
		--format json

	# Same assertion against the persisted snapshots, resolved by id in the
	# store: the divergence must survive the round-trip, not just live in the
	# files the last command happened to write.
	$s0Id = Get-SnapshotId $s0Path
	$a1Id = Get-SnapshotId $a1Path
	$a2Id = Get-SnapshotId $a2Path
	Invoke-Genos snapshot check-var `
		--key counter `
		--store $snapshotStore `
		--parent $s0Id --expect-parent 0 `
		--branch $a1Id --expect 10 `
		--branch $a2Id --expect 20 `
		--expect-isolated `
		--format json

	# The two branches now differ on exactly two logical fields: the variable
	# they wrote, and the cursor pointing at their own write event.
	Write-Host "[6/8] assert the diverging write is the only difference"
	Invoke-Genos snapshot compare `
		--a $a1Path `
		--b $a2Path `
		--expect-differing-field state.working_memory `
		--expect-differing-field state.event_cursor.last_event_id `
		--expect-distinct-identity `
		--format json
	# Same two fields, seen through the structural diff: the variable that
	# diverged is reported by key, not as an opaque blob. Untouched forks diff
	# to nothing — see ../counterfactual-demo.
	Invoke-Genos diff $a1Path $a2Path `
		--expect-changed-path state.working_memory.counter `
		--expect-changed-path state.event_cursor.last_event_id `
		--format json
	# A1 learns something A2 never sees. The memory carries provenance — the
	# branch that recorded it, when, and what it came from — so the diff can
	# report where it appeared instead of only that the branches disagree.
	Write-Host "[7/8] A1 records a memory, A2 records nothing"
	$memoryId = (Invoke-GenosJson snapshot add-memory `
		--snapshot $a1Path `
		--kind semantic `
		--content "The API uses PostgreSQL" `
		--source schema-probe `
		--snapshots $snapshotStore `
		--save `
		--events $eventStore `
		--emit-events `
		--format json).memory_id

	# A2 -> A1, so the memory reads as added on A1's side. The record is one
	# entry, not one per field it carries; its id showing up in the ref index is
	# the other.
	Invoke-Genos diff $a2Path $a1Path `
		--expect-changed-path state.working_memory.counter `
		--expect-changed-path "state.memories.$memoryId" `
		--expect-changed-path "state.semantic_memory.refs.$memoryId" `
		--expect-changed-path state.event_cursor.sequence `
		--expect-changed-path state.event_cursor.last_event_id `
		--format text

	# A1 now carries two events (its write, then its memory) and A2 still one,
	# on streams that never crossed.
	Write-Host "[8/8] assert isolated event streams via replay"
	Invoke-Genos replay basic --events $eventStore --snapshot $a1Path --expect-last-sequence 2 --format json
	Invoke-Genos replay basic --events $eventStore --snapshot $a2Path --expect-last-sequence 1 --format json

	Write-Host ""
	Write-Host "Demo OK: S0(counter=0) -> A1(counter=10) | A2(counter=20)"
	Write-Host "memory_added_in_a1=$memoryId"
	Write-Host "snapshot_store=$snapshotStore"
	Write-Host "event_store=$eventStore"
	Write-Host "parent_s0=$s0Path"
	Write-Host "fork_a1=$a1Path"
	Write-Host "fork_a2=$a2Path"
}
finally {
	Pop-Location
}

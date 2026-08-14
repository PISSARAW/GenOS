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

	& cargo run --quiet -p genos-cli -- @GenosArgs
	if ($LASTEXITCODE -ne 0) {
		throw "genos command failed: genos $($GenosArgs -join ' ')"
	}
}

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

# Pull a top-level string field out of a single-line JSON object.
function Get-JsonString {
	param(
		[string]$Json,
		[string]$Field
	)

	# Single-quoted here-string so the [ and " characters don't get parsed
	# as PowerShell operators or escapes.
	$pattern = '(?<=^|,)"' + $Field + '": *"([^"]*)"'
	$match = [regex]::Match($Json, $pattern)
	if (-not $match.Success) {
		throw "field '$Field' not found in JSON: $Json"
	}
	$match.Groups[1].Value
}

function Get-JsonNumber {
	param(
		[string]$Json,
		[string]$Field
	)

	$pattern = '(?<=^|,)"' + $Field + '": *([0-9]+)'
	$match = [regex]::Match($Json, $pattern)
	if (-not $match.Success) {
		throw "field '$Field' not found in JSON: $Json"
	}
	[int]$match.Groups[1].Value
}

# The snapshot store resolves ids to the *last* line matching the id (it's
# append-only). Reading the rewound snapshot through the store confirms the
# rewind also survives a round-trip, not just the file the previous command
# happened to write.
function Get-CounterValue {
	param([string]$Path)

	$json = Get-Content -Raw $Path | ConvertFrom-Json
	$counter = $json.state.working_memory.items | Where-Object { $_.key -eq "counter" } | Select-Object -First 1
	if (-not $counter) { throw "no counter in $Path" }
	$counter.value
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot

try {
	$demoDir = ".genos/demo/snapshot-restore"
	$snapshotStore = "$demoDir/agent-snapshots.jsonl"
	$eventStore = "$demoDir/agent-events.jsonl"
	$agentPath = "$demoDir/agent-a.json"
	$s0Path = "$demoDir/snapshot-s0.json"
	# Original-saved snapshot copied to a stable file before any writes, so
	# the final `snapshot compare` step can reference it as --b by file path
	# regardless of what subsequent commands wrote to the store.
	$s0SavedCopy = "$demoDir/snapshot-s0-original.json"

	if (Test-Path $demoDir) {
		Remove-Item -Recurse -Force $demoDir
	}
	New-Item -ItemType Directory -Path $demoDir | Out-Null

	Write-Host "[0/5] build the genos CLI"
	Invoke-Cargo build -p genos-cli

	Write-Host "[1/5] init + create agent A and snapshot S0 with counter=10"
	Invoke-Genos init
	Invoke-Genos agent create --name snapshot-restore --role tester --out $agentPath --format json
	Invoke-Genos snapshot create --agent $agentPath --out $s0Path --memory counter=10 --format json
	# Persist S0 in the store under its own id. Restore later references it
	# by this id (and the store resolves it to the *latest* line with that id).
	Invoke-Genos snapshot save --snapshot $s0Path --store $snapshotStore --format json
	$savedId = (Get-Content -Raw $s0Path | ConvertFrom-Json).snapshot_id
	if (-not $savedId) { throw "could not extract S0 snapshot_id" }
	# Keep a separate file copy of the original snapshot so we can compare
	# against it later by file path. The store resolves ids to the *latest*
	# line, so it can't serve this purpose after restore writes a second
	# line.
	Copy-Item $s0Path $s0SavedCopy

	Write-Host "[2/5] write counter=50 on S0 (advances the cursor by one event)"
	# Note: no --save here. Saving the post-write snapshot would overwrite
	# the line in the store that we're about to point --source at; the
	# store is append-only and `get_snapshot` returns the latest line with
	# the id, so a second save would make restore a no-op against itself.
	$setVarOut = Invoke-GenosJson snapshot set-var `
		--snapshot $s0Path `
		--key counter `
		--value 50 `
		--events $eventStore --emit-events `
		--format json
	if ($setVarOut.event_sequence -ne 1) {
		throw "expected first set-var event_sequence=1, got $($setVarOut.event_sequence)"
	}
	if ((Get-CounterValue $s0Path) -ne "50") {
		throw "expected counter=50 after set-var, got $(Get-CounterValue $s0Path)"
	}

	Write-Host "[3/5] restore S0 to the saved snapshot (counter goes 50 -> 10)"
	$restoreOut = Invoke-GenosJson snapshot restore `
		--snapshot $s0Path `
		--source $savedId `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--expect-same-state `
		--format json
	if ($restoreOut.event_sequence -ne 2) {
		throw "expected restore event_sequence=2, got $($restoreOut.event_sequence)"
	}
	if ($restoreOut.previous_sequence -ne 1) {
		throw "expected restore previous_sequence=1, got $($restoreOut.previous_sequence)"
	}

	# After restore the file on disk should read counter=10 again. The
	# rewound snapshot keeps its snapshot_id, agent_id and branch_id — only
	# the logical state changed.
	if ((Get-CounterValue $s0Path) -ne "10") {
		throw "expected counter=10 after restore, got $(Get-CounterValue $s0Path)"
	}

	# The restored-fields list must name the working memory and the two
	# cursor fields (counter rewound, cursor advanced past the Restored event).
	if (-not $restoreOut.restored_fields -or $restoreOut.restored_fields.Count -lt 3) {
		throw "expected at least 3 restored_fields, got $($restoreOut.restored_fields -join ', ')"
	}
	foreach ($field in @("state.working_memory", "state.event_cursor.sequence", "state.event_cursor.last_event_id")) {
		if (-not ($restoreOut.restored_fields -contains $field)) {
			throw "expected $field in restored_fields, got $($restoreOut.restored_fields -join ', ')"
		}
	}

	Write-Host "[4/5] replay S0's stream -- set-var (50), restored -- both still on the branch"
	Invoke-Genos replay basic --events $eventStore --snapshot $s0Path --expect-last-sequence 2 --format json

	# The event store file is append-only by construction; reading it raw
	# lists both events in order with the expected types.
	$rawLines = Get-Content $eventStore | Where-Object { $_.Trim() -ne "" }
	if ($rawLines.Count -ne 2) {
		throw "expected 2 events on disk, got $($rawLines.Count)"
	}
	$firstEvent = $rawLines[0] | ConvertFrom-Json
	$secondEvent = $rawLines[1] | ConvertFrom-Json
	if ($firstEvent.event_type -ne "memory_updated") {
		throw "expected first event type=memory_updated, got $($firstEvent.event_type)"
	}
	if ($secondEvent.event_type -ne "restored") {
		throw "expected second event type=restored, got $($secondEvent.event_type)"
	}

	# The snapshot store also keeps both the saved and the rewound S0 line
	# (append-only: same id appears twice in the JSONL). `snapshot list`
	# returns unique ids, so this is still one id.
	$listOut = Invoke-GenosJson snapshot list --store $snapshotStore --format json
	if ($listOut.count -ne 1) {
		throw "expected snapshot list to report count=1 (S0), got $($listOut.count)"
	}

	# Re-resolving S0 through the store must still show counter=10 — the
	# rewind survives a round-trip, not just the file the previous command
	# wrote.
	$resolved = Invoke-GenosJson snapshot get --snapshot-id $savedId --store $snapshotStore --format json
	if (-not $resolved.snapshot) { throw "snapshot get returned no snapshot" }
	$resolvedCounter = ($resolved.snapshot.state.working_memory.items | Where-Object { $_.key -eq "counter" } | Select-Object -First 1).value
	if ($resolvedCounter -ne "10") {
		throw "expected resolved counter=10, got $resolvedCounter"
	}

	Write-Host "[5/5] rewound S0 keeps its branch_id (restore != fork)"
	# Compare the rewound S0 against the original saved snapshot. After
	# restore S0 has counter=10 (matches the saved copy) but its event
	# cursor now points at the Restored event (sequence=2 vs the saved
	# sequence=0). Identity is preserved on both sides.
	$compareOut = Invoke-GenosJson snapshot compare `
		--a $s0Path `
		--b $s0SavedCopy `
		--format json

	# After restore S0 is logically equal to the saved S0 aside from the
	# cursor (which now points at the Restored event). Identity stays the
	# same: same snapshot_id, same agent_id, same branch_id — that's the
	# whole point of restore vs fork.
	if ($compareOut.comparison.same_logical_state) {
		throw "expected same_logical_state=false after restore"
	}
	if ($compareOut.comparison.distinct_snapshot_id) {
		throw "expected distinct_snapshot_id=false (restore preserves id)"
	}
	if ($compareOut.comparison.distinct_branch_id) {
		throw "expected distinct_branch_id=false (restore stays on branch)"
	}

	Write-Host ""
	Write-Host "Demo OK: counter=10 -> snapshot -> counter=50 -> restore -> counter=10"
	Write-Host "history stays visible: $(($rawLines | Measure-Object).Count) events on the branch stream"
	Write-Host "saved_id=$savedId"
	Write-Host "snapshot_store=$snapshotStore"
	Write-Host "event_store=$eventStore"
	Write-Host "s0_path=$s0Path"
}
finally {
	Pop-Location
}
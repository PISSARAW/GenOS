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

# Same as Invoke-Genos, but the JSON is echoed *and* returned so ids can
# feed the next step.
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

function Get-BeliefField {
	param(
		[string]$SnapshotPath,
		[string]$BeliefId,
		[string]$Field
	)

	$json = Get-Content -Raw $SnapshotPath | ConvertFrom-Json
	$belief = $json.state.beliefs | Where-Object { $_.id -eq $BeliefId } | Select-Object -First 1
	if (-not $belief) {
		throw "belief $BeliefId not found in $SnapshotPath"
	}
	$belief.$Field
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot

try {
	$demoDir = ".genos/demo/belief-update"
	$snapshotStore = "$demoDir/agent-snapshots.jsonl"
	$eventStore = "$demoDir/agent-events.jsonl"
	$agentPath = "$demoDir/agent-a.json"
	$s0Path = "$demoDir/snapshot-s0.json"
	$forkDir = "$demoDir/forks"
	$a1Path = "$forkDir/fork-1.json"

	if (Test-Path $demoDir) {
		Remove-Item -Recurse -Force $demoDir
	}
	New-Item -ItemType Directory -Path $demoDir | Out-Null
	New-Item -ItemType Directory -Path $forkDir | Out-Null

	Write-Host "[0/6] build the genos CLI"
	Invoke-Cargo -CargoArgs @("build", "-p", "genos-cli")

	Write-Host "[1/6] init + create agent A and snapshot S0"
	Invoke-Genos init
	Invoke-Genos agent create --name belief-update --role tester --out $agentPath --format json
	Invoke-Genos snapshot create --agent $agentPath --out $s0Path --format json
	Invoke-Genos snapshot save --snapshot $s0Path --store $snapshotStore --format json

	Write-Host "[2/6] record (api, uses, postgres) on S0 with confidence 0.9"
	$addOut = Invoke-GenosJson snapshot set-belief `
		--snapshot $s0Path `
		--subject api --predicate uses --object postgres `
		--confidence 0.9 `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--format json
	$beliefId = $addOut.belief_id

	Write-Host "[3/6] fork A1 from S0"
	Invoke-Genos agent fork-from-snapshot `
		--snapshot $s0Path `
		--count 1 `
		--out-dir $forkDir `
		--snapshots $snapshotStore --save `
		--format json

	Write-Host "[4/6] A1 overwrites the belief to confidence 0.4"
	$updateOut = Invoke-GenosJson snapshot set-belief `
		--snapshot $a1Path `
		--subject api --predicate uses --object postgres `
		--confidence 0.4 `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--format json
	$updBeliefId = $updateOut.belief_id
	$updPrevious = $updateOut.previous_confidence

	# Same belief record, only the confidence moved.
	if ($beliefId -ne $updBeliefId) {
		throw "expected belief_id to be preserved across the fork, got $beliefId vs $updBeliefId"
	}
	if ($updPrevious -ne "0.9") {
		throw "expected previous_confidence=0.9 on the update, got $updPrevious"
	}

	Write-Host "[5/6] assert S0.confidence=0.9, A1.confidence=0.4"
	$s0Conf = Get-BeliefField -SnapshotPath $s0Path -BeliefId $beliefId -Field "confidence"
	$a1Conf = Get-BeliefField -SnapshotPath $a1Path -BeliefId $beliefId -Field "confidence"
	if ($s0Conf -ne "0.9") { throw "expected S0 confidence 0.9, got $s0Conf" }
	if ($a1Conf -ne "0.4") { throw "expected A1 confidence 0.4, got $a1Conf" }

	# Same assertion against the persisted snapshots, resolved by id in the
	# store: the divergence must survive the round-trip, not just live in the
	# files the last command happened to write.
	$s0Id = Get-SnapshotId $s0Path
	$a1Id = Get-SnapshotId $a1Path
	$s0ConfFromStore = (Invoke-Genos snapshot get --snapshot-id $s0Id --store $snapshotStore --format json).state.beliefs `
		| Where-Object { $_.id -eq $beliefId } | Select-Object -First 1 | Select-Object -ExpandProperty confidence
	$a1ConfFromStore = (Invoke-Genos snapshot get --snapshot-id $a1Id --store $snapshotStore --format json).state.beliefs `
		| Where-Object { $_.id -eq $beliefId } | Select-Object -First 1 | Select-Object -ExpandProperty confidence
	if ($s0ConfFromStore -ne "0.9") { throw "expected store-resolved S0 confidence 0.9, got $s0ConfFromStore" }
	if ($a1ConfFromStore -ne "0.4") { throw "expected store-resolved A1 confidence 0.4, got $a1ConfFromStore" }

	Write-Host "[6/6] diff + replay assertions"
	Invoke-Genos snapshot compare `
		--a $s0Path --b $a1Path `
		--expect-differing-field "state.beliefs" `
		--expect-differing-field state.event_cursor.sequence `
		--expect-differing-field state.event_cursor.last_event_id `
		--expect-distinct-identity `
		--format json

	Invoke-Genos diff $s0Path $a1Path `
		--expect-changed-path "state.beliefs.$beliefId.confidence" `
		--expect-changed-path state.event_cursor.sequence `
		--expect-changed-path state.event_cursor.last_event_id `
		--format text

	Invoke-Genos replay basic --events $eventStore --snapshot $s0Path --expect-last-sequence 1 --format json
	Invoke-Genos replay basic --events $eventStore --snapshot $a1Path --expect-last-sequence 2 --format json

	Write-Host ""
	Write-Host "Demo OK: S0(confidence=0.9) -> A1(confidence=0.4)"
	Write-Host "belief_id=$beliefId"
	Write-Host "snapshot_store=$snapshotStore"
	Write-Host "event_store=$eventStore"
	Write-Host "parent_s0=$s0Path"
	Write-Host "fork_a1=$a1Path"
}
finally {
	Pop-Location
}

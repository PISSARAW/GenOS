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

	$output = & cargo run --quiet -p genos-cli -- @GenosArgs
	if ($LASTEXITCODE -ne 0) {
		throw "genos command failed: genos $($GenosArgs -join ' ')"
	}
	$output -join "`n"
}

function Invoke-GenosJson {
	param(
		[Parameter(ValueFromRemainingArguments = $true)]
		[string[]]$GenosArgs
	)

	$output = Invoke-Genos @GenosArgs
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

function Get-CounterValue {
	param([string]$Path)

	$json = Get-Content -Raw $Path | ConvertFrom-Json
	$counter = $json.state.working_memory.items | Where-Object { $_.key -eq "counter" } | Select-Object -First 1
	if (-not $counter) { throw "no counter in $Path" }
	$counter.value
}

function Get-ShortId {
	param([string]$Id)
	$Id.Substring(0, [Math]::Min(8, $Id.Length))
}

# Walk the lineage tree (BFS) and return the node whose snapshot_id
# matches $Id, or $null if none.
function Find-LineageNode {
	param(
		[object]$Node,
		[string]$Id
	)
	$queue = New-Object System.Collections.Generic.Queue[object]
	$queue.Enqueue($Node)
	while ($queue.Count -gt 0) {
		$current = $queue.Dequeue()
		if ($current.snapshot_id -eq $Id) { return $current }
		foreach ($child in $current.children) { $queue.Enqueue($child) }
	}
	return $null
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot

try {
	$demoDir = ".genos/demo/snapshot-timeline"
	$snapshotStore = "$demoDir/agent-snapshots.jsonl"
	$eventStore = "$demoDir/agent-events.jsonl"
	$agentPath = "$demoDir/agent-a.json"
	$s0Path = "$demoDir/snapshot-s0.json"
	$s1Path = "$demoDir/snapshot-s1.json"
	$s2Path = "$demoDir/snapshot-s2.json"
	$s3Path = "$demoDir/snapshot-s3.json"
	$forksDir = "$demoDir/forks"

	if (Test-Path $demoDir) {
		Remove-Item -Recurse -Force $demoDir
	}
	New-Item -ItemType Directory -Path $demoDir | Out-Null
	New-Item -ItemType Directory -Path $forksDir | Out-Null

	Write-Host "[0/9] build the genos CLI"
	Invoke-Cargo -CargoArgs @("build", "-p", "genos-cli")

	Write-Host "[1/9] init + create agent A + snapshot S0 (counter=10)"
	Invoke-Genos init | Out-Null
	Invoke-Genos agent create --name snapshot-timeline --role tester --out $agentPath --format json | Out-Null
	Invoke-Genos snapshot create --agent $agentPath --out $s0Path --memory counter=10 --format json | Out-Null
	$s0Id = (Get-Content -Raw $s0Path | ConvertFrom-Json).snapshot_id
	$s0Branch = (Get-Content -Raw $s0Path | ConvertFrom-Json).branch_id
	if (-not $s0Id) { throw "could not extract S0 snapshot_id" }

	Write-Host "[2/9] counter=20 on S0, checkpoint -> S1 (fresh id, same branch)"
	Invoke-GenosJson snapshot set-var --snapshot $s0Path --key counter --value 20 --events $eventStore --emit-events --format json | Out-Null
	if ((Get-CounterValue $s0Path) -ne "20") {
		throw "expected counter=20 after set-var, got $(Get-CounterValue $s0Path)"
	}

	$s1Out = Invoke-GenosJson snapshot checkpoint `
		--snapshot $s0Path `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--expect-fresh-id --expect-same-branch `
		--out $s1Path --format json
	$s1Id = $s1Out.snapshot_id
	$s1SourceId = $s1Out.source_snapshot_id
	$s1Branch = $s1Out.branch_id
	if (-not $s1Id) { throw "could not extract S1 snapshot_id" }
	if ($s1Id -eq $s0Id) { throw "expected S1 != S0, both were $s1Id" }
	if ($s1SourceId -ne $s0Id) { throw "expected S1's parent to be S0, got $s1SourceId" }
	if ($s1Branch -ne $s0Branch) { throw "expected S1 to share branch with S0" }
	if ($s1Out.event_sequence -ne 2) { throw "expected checkpoint event_sequence=2, got $($s1Out.event_sequence)" }

	Write-Host "[3/9] counter=30 on S1, checkpoint -> S2"
	Invoke-GenosJson snapshot set-var --snapshot $s1Path --key counter --value 30 --events $eventStore --emit-events --format json | Out-Null
	if ((Get-CounterValue $s1Path) -ne "30") {
		throw "expected counter=30 after set-var, got $(Get-CounterValue $s1Path)"
	}

	$s2Out = Invoke-GenosJson snapshot checkpoint `
		--snapshot $s1Path `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--expect-fresh-id --expect-same-branch `
		--out $s2Path --format json
	$s2Id = $s2Out.snapshot_id
	$s2SourceId = $s2Out.source_snapshot_id
	if ($s2Id -eq $s1Id) { throw "expected S2 != S1" }
	if ($s2SourceId -ne $s1Id) { throw "expected S2's parent to be S1, got $s2SourceId" }

	Write-Host "[4/9] counter=40 on S2, checkpoint -> S3"
	Invoke-GenosJson snapshot set-var --snapshot $s2Path --key counter --value 40 --events $eventStore --emit-events --format json | Out-Null
	if ((Get-CounterValue $s2Path) -ne "40") {
		throw "expected counter=40 after set-var, got $(Get-CounterValue $s2Path)"
	}

	$s3Out = Invoke-GenosJson snapshot checkpoint `
		--snapshot $s2Path `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--expect-fresh-id --expect-same-branch `
		--out $s3Path --format json
	$s3Id = $s3Out.snapshot_id
	$s3SourceId = $s3Out.source_snapshot_id
	if ($s3Id -eq $s2Id) { throw "expected S3 != S2" }
	if ($s3SourceId -ne $s2Id) { throw "expected S3's parent to be S2, got $s3SourceId" }
	if ((Get-CounterValue $s3Path) -ne "40") {
		throw "expected counter=40 in S3, got $(Get-CounterValue $s3Path)"
	}

	Write-Host "[5/9] restore S3 to S1 (counter goes 40 -> 20)"
	$restoreOut = Invoke-GenosJson snapshot restore `
		--snapshot $s3Path `
		--source $s1Id `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--expect-same-state `
		--format json
	if ($restoreOut.event_sequence -ne 7) {
		throw "expected restore event_sequence=7, got $($restoreOut.event_sequence)"
	}
	if ((Get-CounterValue $s3Path) -ne "20") {
		throw "expected counter=20 in S3 after restore, got $(Get-CounterValue $s3Path)"
	}
	if ($restoreOut.target_snapshot_id -ne $s3Id) {
		throw "restore changed S3's id"
	}

	Write-Host "[6/9] fork X1 from S1 (fresh branch, counter=20)"
	$forkOut = Invoke-GenosJson agent fork-from-snapshot `
		--snapshot $s1Id `
		--count 1 `
		--out-dir $forksDir --out-prefix fork `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--format json
	$x1Id = $forkOut.forks[0].snapshot_id
	$x1Path = "$forksDir/fork-1.json"
	if (-not $x1Id) { throw "could not extract X1 snapshot_id" }
	if ($x1Id -eq $s1Id) { throw "fork reused S1's id" }
	if ((Get-CounterValue $x1Path) -ne "20") {
		throw "expected X1 counter=20 (inherited from S1), got $(Get-CounterValue $x1Path)"
	}

	Write-Host "[7/9] render the lineage tree"
	$textTree = Invoke-Genos snapshot lineage `
		--snapshot $s0Path `
		--events $eventStore `
		--snapshots $snapshotStore `
		--format text
	Write-Host "----- text tree -----"
	Write-Host $textTree
	Write-Host "---------------------"
	$textLines = $textTree -split "`r?`n"
	if ($textLines[0] -notmatch "^[0-9a-f]{8}") {
		throw "expected root line starting with a short id, got: $($textLines[0])"
	}
	# Accept either connector (last vs middle child) since the renderer
	# picks one based on sibling position. Use substring contains to
	# sidestep PowerShell 5.1's regex quirks with multi-byte chars.
	$mutationLine = $textLines | Where-Object { $_.Contains("mutation $s1Id") } | Select-Object -First 1
	if (-not $mutationLine) {
		throw "expected mutation edge to S1 (id=$s1Id) in tree. Lines:`n$($textLines -join "`n")"
	}
	$forkLine = $textLines | Where-Object { $_.Contains("fork $x1Id") } | Select-Object -First 1
	if (-not $forkLine) {
		throw "expected fork edge to X1 (id=$x1Id) in tree. Lines:`n$($textLines -join "`n")"
	}

	Write-Host "[8/9] machine-readable tree + assertions"
	$lineage = Invoke-GenosJson snapshot lineage `
		--snapshot $s0Path `
		--events $eventStore `
		--snapshots $snapshotStore `
		--format json

	# Total edges: S0->S1 (mutation), S1->S2 (mutation), S2->S3 (mutation),
	# S1->X1 (fork), S1->S3 (restore). The restore edge to S3 doesn't
	# re-parent S3 in the rendered tree, but it IS present on the dag.
	if ($lineage.edges -ne 5) {
		throw "expected 5 edges in dag, got $($lineage.edges)"
	}

	$s1Node = Find-LineageNode $lineage.tree $s1Id
	if (-not $s1Node) { throw "S1 not found in lineage tree" }
	if ($s1Node.children.Count -ne 2) {
		throw "expected S1 to have 2 children, got $($s1Node.children.Count)"
	}
	if (-not ($s1Node.children | Where-Object { $_.relation -eq "mutation" })) {
		throw "expected a mutation edge under S1"
	}
	if (-not ($s1Node.children | Where-Object { $_.relation -eq "fork" })) {
		throw "expected a fork edge under S1"
	}

	$s2Node = Find-LineageNode $lineage.tree $s2Id
	if (-not $s2Node) { throw "S2 not found in lineage tree" }
	if ($s2Node.children.Count -ne 1) {
		throw "expected S2 to have 1 child, got $($s2Node.children.Count)"
	}

	$x1Node = Find-LineageNode $lineage.tree $x1Id
	if (-not $x1Node) { throw "X1 not found in lineage tree" }
	if ($x1Node.children.Count -ne 0) {
		throw "expected X1 to be a leaf, got $($x1Node.children.Count) children"
	}

	Write-Host ""
	Write-Host "Demo OK: S0 -> S1 -> {S2 -> S3, X1} (5 edges, S1 has 2 children)"
	$eventCount = (Get-Content $eventStore | Where-Object { $_.Trim() -ne "" } | Measure-Object).Count
	Write-Host "history stays visible: $eventCount events on the branch stream"
	Write-Host "s0_id=$s0Id"
	Write-Host "s1_id=$s1Id"
	Write-Host "s2_id=$s2Id"
	Write-Host "s3_id=$s3Id"
	Write-Host "x1_id=$x1Id"
	Write-Host "snapshot_store=$snapshotStore"
	Write-Host "event_store=$eventStore"
}
finally {
	Pop-Location
}

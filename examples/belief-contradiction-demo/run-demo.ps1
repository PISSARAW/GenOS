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
	$demoDir = ".genos/demo/belief-contradiction"
	$snapshotStore = "$demoDir/agent-snapshots.jsonl"
	$eventStore = "$demoDir/agent-events.jsonl"
	$contradictLog = "$demoDir/contradiction-notice.txt"
	$agentPath = "$demoDir/agent-a.json"
	$s0Path = "$demoDir/snapshot-s0.json"

	if (Test-Path $demoDir) {
		Remove-Item -Recurse -Force $demoDir
	}
	New-Item -ItemType Directory -Path $demoDir | Out-Null

	Write-Host "[0/5] build the genos CLI"
	Invoke-Cargo -CargoArgs @("build", "-p", "genos-cli")

	Write-Host "[1/5] init + create agent A and snapshot S0"
	Invoke-Genos init
	Invoke-Genos agent create --name belief-contradiction --role tester --out $agentPath --format json
	Invoke-Genos snapshot create --agent $agentPath --out $s0Path --format json
	Invoke-Genos snapshot save --snapshot $s0Path --store $snapshotStore --format json

	Write-Host "[2/5] record (api, is_bottleneck, true, 0.8) on S0"
	$firstOut = Invoke-GenosJson snapshot set-belief `
		--snapshot $s0Path `
		--subject api --predicate is_bottleneck --object true `
		--confidence 0.8 `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--format json
	$firstBeliefId = $firstOut.belief_id
	if (-not $firstOut.contradictions -or $firstOut.contradictions.Count -ne 0) {
		throw "expected first write to have no contradictions"
	}

	Write-Host "[3/5] record (api, is_bottleneck, false, 0.7) on S0 — triggers detection"
	# Capture stdout (JSON) and stderr (contradiction notice) separately so
	# we can assert against each.
	$secondStdout = "$demoDir/second-belief.json"
	$secondStderr = "$demoDir/second-belief.stderr.txt"
	& cargo run --quiet -p genos-cli -- snapshot set-belief `
		--snapshot $s0Path `
		--subject api --predicate is_bottleneck --object false `
		--confidence 0.7 `
		--snapshots $snapshotStore --save `
		--events $eventStore --emit-events `
		--format json `
		> $secondStdout 2> $secondStderr
	if ($LASTEXITCODE -ne 0) {
		throw "second snapshot set-belief failed"
	}
	$secondNotice = Get-Content -Raw $secondStderr
	Write-Host $secondNotice
	$secondNotice | Out-File -Encoding utf8 $contradictLog

	$secondJson = Get-Content -Raw $secondStdout | ConvertFrom-Json
	$secondBeliefId = $secondJson.belief_id

	if (-not ($secondNotice -match "CONTRADICTION DETECTED")) {
		throw "expected stderr to print CONTRADICTION DETECTED, got: $secondNotice"
	}
	if (-not ($secondNotice -match [regex]::Escape($secondBeliefId))) {
		throw "expected stderr to mention $secondBeliefId"
	}
	if (-not ($secondNotice -match [regex]::Escape($firstBeliefId))) {
		throw "expected stderr to mention opposing $firstBeliefId"
	}

	Write-Host "[4/5] assert both records are Disputed and reference each other"
	$s0Json = Get-Content -Raw $s0Path | ConvertFrom-Json
	$firstStatus = ($s0Json.state.beliefs | Where-Object { $_.id -eq $firstBeliefId } | Select-Object -First 1).status
	$secondStatus = ($s0Json.state.beliefs | Where-Object { $_.id -eq $secondBeliefId } | Select-Object -First 1).status
	if ($firstStatus -ne "disputed") { throw "expected first belief status=disputed, got: $firstStatus" }
	if ($secondStatus -ne "disputed") { throw "expected second belief status=disputed, got: $secondStatus" }

	$firstContradicts = ($s0Json.state.beliefs | Where-Object { $_.id -eq $firstBeliefId } | Select-Object -First 1).contradicts
	$secondContradicts = ($s0Json.state.beliefs | Where-Object { $_.id -eq $secondBeliefId } | Select-Object -First 1).contradicts
	if (-not ($firstContradicts -contains $secondBeliefId)) { throw "expected first.contradicts to contain $secondBeliefId" }
	if (-not ($secondContradicts -contains $firstBeliefId)) { throw "expected second.contradicts to contain $firstBeliefId" }

	if (-not ($secondJson.contradictions -contains $firstBeliefId)) {
		throw "expected second output.contradictions to contain $firstBeliefId"
	}

	Write-Host "[5/5] replay S0's stream — first write, second write, contradiction marker"
	Invoke-Genos replay basic --events $eventStore --snapshot $s0Path --expect-last-sequence 3 --format json

	$s0Id = (Get-Content -Raw $s0Path | ConvertFrom-Json).snapshot_id
	$resolvedCursor = (Invoke-Genos snapshot get --snapshot-id $s0Id --store $snapshotStore --format json).state.event_cursor.sequence
	if ($resolvedCursor -ne 3) { throw "expected event_cursor.sequence=3 on S0, got $resolvedCursor" }

	Write-Host ""
	Write-Host "Demo OK: contradiction detected between (api, is_bottleneck, true, 0.8) and (api, is_bottleneck, false, 0.7)"
	Write-Host "first_belief_id=$firstBeliefId"
	Write-Host "second_belief_id=$secondBeliefId"
	Write-Host "snapshot_store=$snapshotStore"
	Write-Host "event_store=$eventStore"
	Write-Host "parent_s0=$s0Path"
	Write-Host "contradiction_stderr=$contradictLog"
}
finally {
	Pop-Location
}

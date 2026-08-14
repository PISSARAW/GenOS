$ErrorActionPreference = "Stop"

Write-Host "[1/6] init"
cargo run -p genos-cli -- init | Out-Host

Write-Host "[2/6] world create"
$world = cargo run -p genos-cli -- world create --provider directory --format json | ConvertFrom-Json
$worldId = $world.world_id
Write-Host "world_id=$worldId"

Write-Host "[3/6] mutate base world"
"candidate base" | Out-File -Encoding utf8 ".genos/world/worlds/$worldId/result.txt"

Write-Host "[4/6] snapshot + fork"
$snapshot = cargo run -p genos-cli -- world snapshot --provider directory --world-id $worldId --format json | ConvertFrom-Json
$snapshotId = $snapshot.snapshot_id
Write-Host "snapshot_id=$snapshotId"

$forks = cargo run -p genos-cli -- world fork --provider directory --snapshot-id $snapshotId --count 2 --format json | ConvertFrom-Json
$worldA = $forks.world_ids[0]
$worldB = $forks.world_ids[1]
Write-Host "world_a=$worldA"
Write-Host "world_b=$worldB"

Write-Host "[5/6] mutate forks"
"branch A" | Out-File -Encoding utf8 ".genos/world/worlds/$worldA/outcome.txt"
"branch B with extra change" | Out-File -Encoding utf8 ".genos/world/worlds/$worldB/outcome.txt"

Write-Host "[6/6] diff"
$diff = cargo run -p genos-cli -- world diff --provider directory --world-a $worldA --world-b $worldB --format json | ConvertFrom-Json
$diff | ConvertTo-Json -Depth 4 | Out-Host

Write-Host "Done. files_changed=$($diff.files_changed)"

# Counterfactual Demo

Target V0 demo:

1. Create agent
2. Snapshot
3. Fork branches
4. Execute isolated world mutations
5. Evaluate
6. Diff and select winner

## CLI chain (world create/snapshot/fork/diff)

This sequence uses the directory provider and is designed to bootstrap the
counterfactual flow end to end.

### PowerShell (Windows)

```powershell
cargo run -p genos-cli -- init

$world = cargo run -p genos-cli -- world create --provider directory --format json | ConvertFrom-Json
$worldId = $world.world_id

"candidate A" | Out-File -Encoding utf8 ".genos/world/worlds/$worldId/result.txt"

$snapshot = cargo run -p genos-cli -- world snapshot --provider directory --world-id $worldId --format json | ConvertFrom-Json
$snapshotId = $snapshot.snapshot_id

$forks = cargo run -p genos-cli -- world fork --provider directory --snapshot-id $snapshotId --count 2 --format json | ConvertFrom-Json
$worldA = $forks.world_ids[0]
$worldB = $forks.world_ids[1]

"branch A" | Out-File -Encoding utf8 ".genos/world/worlds/$worldA/outcome.txt"
"branch B with extra change" | Out-File -Encoding utf8 ".genos/world/worlds/$worldB/outcome.txt"

cargo run -p genos-cli -- world diff --provider directory --world-a $worldA --world-b $worldB --format json
```

### What to expect

- `world create` returns a new `world_id`
- `world snapshot` returns a `snapshot_id`
- `world fork` returns one `world_id` per branch
- `world diff` returns `files_changed` between the two forks

Use this as the handoff point for the evaluation/scoring stage of the
counterfactual demo.

### Bash (Linux/macOS)

```bash
cargo run -p genos-cli -- init

WORLD_JSON="$(cargo run -p genos-cli -- world create --provider directory --format json)"
WORLD_ID="$(printf '%s' "$WORLD_JSON" | jq -r '.world_id')"

printf 'candidate A\n' > ".genos/world/worlds/$WORLD_ID/result.txt"

SNAPSHOT_JSON="$(cargo run -p genos-cli -- world snapshot --provider directory --world-id "$WORLD_ID" --format json)"
SNAPSHOT_ID="$(printf '%s' "$SNAPSHOT_JSON" | jq -r '.snapshot_id')"

FORKS_JSON="$(cargo run -p genos-cli -- world fork --provider directory --snapshot-id "$SNAPSHOT_ID" --count 2 --format json)"
WORLD_A="$(printf '%s' "$FORKS_JSON" | jq -r '.world_ids[0]')"
WORLD_B="$(printf '%s' "$FORKS_JSON" | jq -r '.world_ids[1]')"

printf 'branch A\n' > ".genos/world/worlds/$WORLD_A/outcome.txt"
printf 'branch B with extra change\n' > ".genos/world/worlds/$WORLD_B/outcome.txt"

cargo run -p genos-cli -- world diff --provider directory --world-a "$WORLD_A" --world-b "$WORLD_B" --format json
```

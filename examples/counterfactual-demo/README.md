# Counterfactual Demo

Scenario implemented in this demo:

```text
Agent A -> snapshot S0 -> fork A1, A2
```

Both clones start from the same logical state while having distinct:

- `AgentId`
- `BranchId`
- event streams

No LLM call is required for this flow.

## What the script does

1. Create agent A.
2. Create snapshot S0, seeding a minimal memory through `snapshot create` flags.
3. Derive A1 and A2 from S0 with `agent fork-from-snapshot`, which also persists
   both forks to the snapshot store and appends one `fork_created` event per fork.
4. Assert with `snapshot compare` that A1 and A2 share every logical state field
   and differ on every identity field.
5. Assert with `genos diff --expect-empty` that the structural diff between the
   two untouched forks is empty.
6. Replay each branch with `replay basic` and assert the streams stay isolated.

Every step is a `genos` command: the demo never edits snapshot or event JSON by
hand, so the invariants it proves are the ones the CLI actually enforces.

### PowerShell (Windows)

```powershell
.\run-demo.ps1
```

### Bash (Linux/macOS)

```bash
./run-demo.sh
```

### What to expect

- The script stops immediately on any assertion failure: the assertions live in
  the CLI itself (`--expect-same-state`, `--expect-distinct-identity`,
  `--expect-empty`, `--expect-last-sequence`), which exits non-zero when an
  invariant breaks.
- Final output prints `Demo OK` plus the store and fork file paths. The fork ids
  are in the `agent fork-from-snapshot` JSON output above it.
- Snapshot store, event store and fork snapshots are generated under:
  - `.genos/demo/clone-without-llm/agent-snapshots.jsonl`
  - `.genos/demo/clone-without-llm/agent-events.jsonl`
  - `.genos/demo/clone-without-llm/forks/fork-1.json`
  - `.genos/demo/clone-without-llm/forks/fork-2.json`

Use this as the minimal reproducible proof for clone identity isolation before
adding evaluation/scoring logic. Once the clones exist,
[`../divergent-writes-demo`](../divergent-writes-demo) takes the next step and
proves state isolation: the two branches write the same variable differently
without either write reaching the sibling or the parent.

## CLI commands behind the demo

### `agent fork-from-snapshot`

Derives `--count` sibling forks from a parent snapshot without any model call.
Each fork gets a fresh `snapshot_id`, `agent_id` and `branch_id`; its event
cursor is rebound to the new branch with `last_event_id` cleared, while the
parent's `sequence` is kept as the lineage watermark.

```bash
genos agent fork-from-snapshot \
  --snapshot .genos/demo/clone-without-llm/snapshot-s0.json \
  --count 2 \
  --out-dir .genos/demo/clone-without-llm/forks \
  --snapshots .genos/demo/clone-without-llm/agent-snapshots.jsonl --save \
  --events .genos/demo/clone-without-llm/agent-events.jsonl --emit-events
```

`--snapshot` accepts either a file path or a snapshot id resolved in the
snapshot store. `--save` appends the forks to the store, `--emit-events` appends
one `fork_created` event per fork on the fork's own branch, and `--out-dir`
writes `fork-1.json`, `fork-2.json`, … for downstream commands.

### `snapshot compare`

Compares two snapshots as counterfactual siblings and reports which logical
state fields match. With `--expect-same-state` / `--expect-distinct-identity`
it exits non-zero when the fork contract is violated, so scripts and CI need no
JSON post-processing.

```bash
genos snapshot compare --a fork-1.json --b fork-2.json \
  --expect-same-state --expect-distinct-identity
```

### `snapshot create --memory / --semantic-ref / --episodic-ref`

Seeds working, semantic and episodic memory at snapshot creation time:

```bash
genos snapshot create --agent agent-a.json --out snapshot-s0.json \
  --memory seed_note=minimal-memory --semantic-ref memory-minimal-1
```

### `genos diff`

Diffs the logical state of two snapshots and reports one entry per changed
path. Identity fields are excluded on purpose, which is what makes the diff
between two untouched forks empty:

```bash
genos diff fork-1.json fork-2.json --expect-empty
```

```json
{
  "empty": true,
  "entry_count": 0,
  "changed_paths": [],
  "identity": { "distinct_identity": true, "...": "..." }
}
```

Both sides accept a file path or a snapshot id resolved in the store. The
`identity` block is reported for context only: it shows the two snapshots really
are distinct agents on distinct branches, so the empty diff means "same logical
state", not "same object compared twice". This is the baseline the diff
semantics are defined against — see
[`../divergent-writes-demo`](../divergent-writes-demo) for the non-empty side,
where `--expect-changed-path` asserts exactly which paths moved.

### `replay basic --snapshot`

Replays the branch owned by a snapshot instead of a raw `--branch-id`, and fails
if the replayed stream ever surfaces another agent — the signal that two sibling
branches converged. Combine with `--expect-last-sequence`, `--expect-agent-id`
or `--expect-branch-id` to assert directly from the command's exit code.

```bash
genos replay basic --events agent-events.jsonl --snapshot fork-1.json \
  --expect-last-sequence 1
```

## Continuous integration

`.github/workflows/ci.yml` runs this scenario on every push and pull request, on
both `ubuntu-latest` and `windows-latest`. The `counterfactual-demo` job executes
the matching script and then asserts on its captured output and on the generated
stores: the `Demo OK` marker, `same_logical_state: true`, empty
`differing_fields`, `distinct_identity: true`, three snapshot lines, two event
lines, and two distinct `agent_id`/`branch_id` values in the event store. The
output and the generated stores are uploaded as build artifacts.

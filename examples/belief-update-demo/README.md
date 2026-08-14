# Belief Update Demo

Scenario implemented in this demo:

```text
S0 (no belief)
  -> record belief (api, uses, postgres, confidence=0.9) on S0
  -> fork A1 from S0
A1.belief(api, uses, postgres).confidence = 0.4   # overwrite in place
```

The invariant under test — beliefs fork the same way variables and memory do,
and an update on one branch never reaches the parent or any sibling:

| Snapshot                  | `belief(api, uses, postgres).confidence` |
| ---                       | ---                                       |
| `A1` (the fork that wrote) | `0.4`                                     |
| `S0` (the parent)          | `0.9`                                     |

Same `(subject, predicate, object)` triple, two confidence values, one belief
record per branch — no parallel records, no leaked writes. The `Belief.id`
itself is preserved across the fork (it's part of `state.beliefs`, which
`fork_snapshot` deep-copies); only the `confidence` field diverges, which is
what shows up in the diff as `state.beliefs.<id>.confidence`.

## What the script does

1. Create agent A and snapshot S0 (no belief yet).
2. Record the belief on S0 with `snapshot set-belief --confidence 0.9` — first
   call emits `memory_created`.
3. Derive A1 from S0 with `agent fork-from-snapshot`.
4. On A1, call `snapshot set-belief --confidence 0.4` with the same triple —
   same belief id, `memory_updated` event, `previous_confidence: 0.9`.
5. Assert the per-branch confidence through the snapshot files
   (S0 = 0.9, A1 = 0.4) and through the snapshot ids in the store, so the
   divergence survives the round-trip and isn't only on the file the last
   command happened to write.
6. Diff S0 → A1 and assert that the only belief field that changed is
   `confidence` (i.e. `state.beliefs.<id>.confidence` is the lone belief path
   in the diff).
7. Replay each branch: S0's stream carries the `memory_created`, A1's stream
   carries the `memory_updated` — neither branch saw the other's event.

Every step is a `genos` command: the demo never edits snapshot or event JSON
by hand, so the invariants it proves are the ones the CLI actually enforces.

### PowerShell (Windows)

```powershell
.\run-demo.ps1
```

### Bash (Linux/macOS)

```bash
./run-demo.sh
```

### What to expect

- The script stops immediately on any assertion failure. The assertions live
  in the CLI itself (`--expect-isolated`, `--expect-changed-path`,
  `--expect-last-sequence`), which exits non-zero when an invariant breaks.
- Final output prints `Demo OK: S0(confidence=0.9) -> A1(confidence=0.4)`
  plus the store and fork paths.
- Generated files live under:
  - `.genos/demo/belief-update/agent-snapshots.jsonl` (S0 with the belief,
    then A1 with its overwritten confidence)
  - `.genos/demo/belief-update/agent-events.jsonl` (one `memory_created`
    on S0's branch, one `memory_updated` on A1's branch; S0's stream ends
    at sequence 1, A1's at sequence 2 — each branch sees only its own event)
  - `.genos/demo/belief-update/forks/fork-1.json`

Run [`../divergent-writes-demo`](../divergent-writes-demo) first if you want
the working-memory equivalent: the same shape, but the diverging state is a
flat `key = value` instead of a `(subject, predicate, object)` triple.

## CLI commands behind the demo

### `snapshot set-belief`

Insert-or-update a `(subject, predicate, object)` belief on a snapshot's own
branch. The first call with a given triple creates a `Belief` with a fresh
id and a `memory_created` event. Subsequent calls with the same triple
overwrite `confidence` in place (the `Belief.id` stays the same) and emit a
`memory_updated` event whose payload carries `previous_confidence`.

```bash
genos snapshot set-belief \
  --snapshot fork-1.json \
  --subject api --predicate uses --object postgres \
  --confidence 0.4 \
  --snapshots agent-snapshots.jsonl --save \
  --events agent-events.jsonl --emit-events
```

`--confidence` is validated as a unit interval (`0.0..=1.0`); values outside
that range are rejected at the CLI layer before the snapshot is touched.

### `snapshot compare --expect-differing-field`

Asserts that the logical state fields that differ are exactly the listed ones.
After A1 overwrites confidence, that is:

```bash
genos snapshot compare \
  --a snapshot-s0.json --b fork-1.json \
  --expect-differing-field state.beliefs \
  --expect-differing-field state.event_cursor.last_event_id \
  --expect-distinct-identity
```

The second field is not incidental: A1's cursor now points at its own
`memory_updated` event, while S0's cursor still points at the original
`memory_created` — that is what keeps the two streams independently
replayable.

### `genos diff --expect-changed-path`

The same divergence through the structural diff, which reports the belief by
its `(subject, predicate, object)` triple under `BeliefDiff`:

```text
BeliefDiff
  state.beliefs.<id>.confidence (changed)
    old: 0.9
    new: 0.4
```

`state.beliefs` is key-by-id in the diff (the `Belief` record's own
identifier). What the demo asserts is that the only field under any belief
key that changed between S0 and A1 is `confidence` — no parallel records,
no `subject`/`predicate`/`object_value` differences, no status flips.

## Continuous integration

`.github/workflows/ci.yml` runs this scenario on every push and pull request,
on both `ubuntu-latest` and `windows-latest`, and then re-asserts on the
captured output and the generated stores so a silently gutted script cannot
pass.

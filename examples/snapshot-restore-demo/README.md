# Snapshot / Restore Demo

Scenario implemented in this demo:

```text
S0.counter = 10
snapshot save S0  -> saved_id
S0.counter = 50      # advance the cursor to sequence 1
snapshot restore S0 --source saved_id
S0.counter = 10      # rewound; cursor now at sequence 2 (Restored event)
```

The invariant under test — the one undo property that needs to hold for any
counterfactual workflow that involves a temporary detour:

| Step | `S0.counter` | `S0.event_cursor.sequence` | branch_id |
| --- | --- | --- | --- |
| after `snapshot create --memory counter=10` | `10` | `0` | same |
| after `snapshot set-var --value 50` | `50` | `1` | same |
| after `snapshot restore --source <saved_id>` | `10` | `2` | same |

Three properties hold at the end of the demo, all enforced by the CLI:

1. **State is rewound**: the working memory's `counter` is `"10"` again after
   `snapshot restore` finishes.
2. **Identity is preserved**: the rewound `S0` keeps its `snapshot_id`,
   `agent_id`, and `branch_id` — a fork would mint new ids.
3. **History stays visible**: the event store keeps every event it ever
   received (it is append-only by construction). The `Restored` event is
   appended at sequence 2 alongside the original `memory_updated` event
   at sequence 1; `replay basic --expect-last-sequence 2` reads both.

## What the script does

1. Create agent A and snapshot S0 with `counter=10` seeded through
   `snapshot create --memory`.
2. Persist S0 in the snapshot store under its id (`saved_id`).
3. Write `counter=50` on S0 with `snapshot set-var` — appends a
   `memory_updated` event at sequence 1.
4. Rewind S0 with `snapshot restore --source <saved_id>` — replaces S0's
   working memory with the saved snapshot's, advances the cursor to
   sequence 2, appends a `Restored` event whose payload carries
   `source_snapshot_id` and `previous_sequence`.
5. Assert the rewound `S0` reads `counter=10` both on disk and after a
   round-trip through the snapshot store (`snapshot get` by id).
6. Assert the event store has both events on the branch stream in order
   (`memory_updated`, then `restored`), and `snapshot list` still reports
   one unique id (the store is append-only: same id appears twice in the
   raw JSONL, but `list` deduplicates).
7. Assert `snapshot compare --a <s0> --b <saved_id>` reports
   `same_logical_state=false` (the cursor differs) but
   `distinct_snapshot_id=false` and `distinct_branch_id=false` — restore
   preserves identity, which is what makes it different from a fork.

Every step is a `genos` command: the demo never edits snapshot or event
JSON by hand, so the invariants it proves are the ones the CLI actually
enforces.

### PowerShell (Windows)

```powershell
.\run-demo.ps1
```

### Bash (Linux/macOS)

```bash
./run-demo.sh
```

### What to expect

- The script stops immediately on any assertion failure. Most assertions
  live in the CLI itself (`--expect-same-state`, `--expect-last-sequence`,
  `snapshot compare --expect-same-state`), which exits non-zero when an
  invariant breaks. The grep-based assertions on the raw event file and
  the working-memory value catch anything the structured assertions miss.
- Final output prints
  `Demo OK: counter=10 -> snapshot -> counter=50 -> restore -> counter=10`
  plus the count of events still on the branch stream and the store paths.
- Generated files live under:
  - `.genos/demo/snapshot-restore/agent-snapshots.jsonl` (the saved S0
    line, then the rewound S0 line — same id, append-only)
  - `.genos/demo/snapshot-restore/agent-events.jsonl` (one
    `memory_updated` from the `set-var` to 50, then one `restored` from
    the `restore` back to 10)
  - `.genos/demo/snapshot-restore/snapshot-s0.json` (the rewound snapshot,
    `counter=10`, sequence=2)

## CLI commands behind the demo

### `snapshot restore`

Rewind a snapshot's logical state to match a previously saved snapshot on
the same branch. The target keeps its `snapshot_id`, `agent_id`, and
`branch_id`; only the logical state is replaced.

```bash
genos snapshot restore \
  --snapshot snapshot-s0.json \
  --source <saved_snapshot_id> \
  --snapshots agent-snapshots.jsonl --save \
  --events agent-events.jsonl --emit-events \
  --expect-same-state
```

`--snapshot` is the working snapshot to rewind (file path or store id);
`--source` is the saved snapshot whose state the target will be rewound
*to*. Both must live on the same branch — a restore that crosses branches
is rejected with a clean `bail!` error before the core panic path fires.

A `restored` event is stamped on the branch stream so the audit trail
records the rewind. Its payload carries `source_snapshot_id` (so a replay
can reconstruct the edge) and `previous_sequence` (so a tool can compute
the cursor jump).

The `restored_fields` field on the output names exactly which
[`LOGICAL_STATE_FIELDS`] actually differed between target and source
before the restore — i.e. the fields the restore rewound. In this demo
those are `state.working_memory` (the counter itself) and the two cursor
fields (`state.event_cursor.sequence` and
`state.event_cursor.last_event_id`, both bumped because the cursor
advances past the new event).

#### History preservation

History preservation is a property of the stores, not the restore command:

- `LocalSnapshotStore` opens with `create(true).append(true)` and never
  truncates or rewrites. The rewound S0 lands as a new line under the
  same id — the old saved line is still there for `snapshot get` to walk
  past if the user prefers the older state.
- `LocalEventStore` opens with `create(true).append(true)` and never
  deletes. The `memory_updated` event from step 3 stays in the file
  alongside the `restored` event from step 4 — a `replay basic` walks
  both, and `grep '"sequence"'` on the raw JSONL counts both.

Because no code path deletes events or rewrites snapshots, the user
explicitly chose "Tout l'historique doit cependant rester visible" and
the demo proves that property by reading the file directly.

## Out of scope

- **Cross-branch restore**: rejected by the CLI (`bail!` before calling
  core) and by the core (`assert_eq!` on `branch_id`). The user's case is
  a single-branch rewind.
- **`restore --at <timestamp>`**: the deterministic-timestamp variant
  exists in core (`restore_snapshot_at`) for tests; it isn't yet exposed
  on the CLI. The demo doesn't need it because `Utc::now()` produces a
  fresh `created_at` for both the rewound snapshot and the `restored`
  event, which is what the on-disk `S0` will end up carrying anyway.
- **`LineageRelation::Restore` edge in the lineage tree**: declared in
  `lineage.rs:8`, not yet emitted. The demo's history-preservation
  proof uses the event store directly rather than a lineage walk.
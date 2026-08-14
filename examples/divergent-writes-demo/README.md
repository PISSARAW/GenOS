# Divergent Writes Demo

Scenario implemented in this demo:

```text
S0(counter=0) -> fork A1, A2
A1.counter = 10
A2.counter = 20
```

The invariant under test — the first one worth having, since every counterfactual
experiment depends on it:

| Snapshot | Expected `counter` |
| --- | --- |
| `A1` | `10` |
| `A2` | `20` |
| `S0` (parent) | `0`, its pre-fork value |

Two branches write the same variable differently, and neither write reaches the
sibling or the parent. No LLM call is required for this flow.

## What the script does

1. Create agent A and snapshot S0 with `counter=0` seeded through
   `snapshot create --memory`.
2. Derive A1 and A2 from S0 with `agent fork-from-snapshot`.
3. Write `counter=10` on A1 and `counter=20` on A2 with `snapshot set-var`, each
   write appending a `memory_updated` event on its own branch.
4. Assert with `snapshot check-var --expect-isolated` that A1 holds `10`, A2
   holds `20` and S0 still holds `0`.
5. Repeat that assertion against the snapshots resolved **by id in the store**,
   so the divergence is proven on the persisted state and not only on the files
   the previous command happened to write.
6. Assert with `snapshot compare` and `genos diff` that the two branches differ
   on exactly the two paths they should.
7. Record a memory on A1 only — `"The API uses PostgreSQL"` — and assert the
   diff reports it as one added memory, with the branch it came from.
8. Replay each branch to confirm the events stayed on separate streams: two on
   A1, one on A2.

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
  the CLI itself (`--expect-isolated`, `--expect-differing-field`,
  `--expect-distinct-identity`, `--expect-last-sequence`), which exits non-zero
  when an invariant breaks.
- Final output prints `Demo OK: S0(counter=0) -> A1(counter=10) | A2(counter=20)`
  plus the store and fork paths.
- Generated files live under:
  - `.genos/demo/divergent-writes/agent-snapshots.jsonl` (S0, then A1/A2 before
    and after their write, then A1 again after its memory — the store is
    append-only, so a snapshot id resolves to its latest line)
  - `.genos/demo/divergent-writes/agent-events.jsonl` (one write event per
    branch, plus A1's `memory_created`)
  - `.genos/demo/divergent-writes/forks/fork-1.json`, `fork-2.json`

Run [`../counterfactual-demo`](../counterfactual-demo) first if you want the
step before this one: two forks that start out logically identical. This demo
picks up where that one stops, at the moment the two branches stop agreeing.
[`../divergent-worlds-demo`](../divergent-worlds-demo) proves the same property
one layer down, where the diverging state is a file inside a forked world
instead of a variable in working memory.

## CLI commands behind the demo

### `snapshot set-var`

Writes a branch-local variable on a snapshot's own branch. The write advances
that branch's event cursor and produces a `memory_created` event for a first
write, `memory_updated` for an overwrite.

```bash
genos snapshot set-var --snapshot fork-1.json --key counter --value 10 \
  --snapshots agent-snapshots.jsonl --save \
  --events agent-events.jsonl --emit-events
```

`--snapshot` accepts a file path or a snapshot id resolved in the store. The
updated snapshot is written back to that file unless `--out` says otherwise,
since the write belongs to that branch's own state. `--save` appends the updated
snapshot to the store and `--emit-events` appends the write event on the
branch's stream.

### `snapshot check-var`

Checks the divergence directly, without JSON post-processing: each `--branch`
must still hold what it wrote, the parent must still hold its pre-fork value,
and no two branches may have landed on the same value.

```bash
genos snapshot check-var --key counter \
  --parent snapshot-s0.json --expect-parent 0 \
  --branch fork-1.json --expect 10 \
  --branch fork-2.json --expect 20 \
  --expect-isolated
```

`--expect` is positional against `--branch`: same count, same order. Omitting it
falls back to each snapshot's current value, which then only checks that the
branches diverged from each other. `--expect-parent-absent` covers the case
where the variable did not exist before the fork. The report names every broken
expectation in `violations`, and `--expect-isolated` turns them into a non-zero
exit.

### `snapshot compare --expect-differing-field`

Asserts that the logical state fields which differ are exactly the listed ones.
After each branch has written once, that is:

```bash
genos snapshot compare --a fork-1.json --b fork-2.json \
  --expect-differing-field state.working_memory \
  --expect-differing-field state.event_cursor.last_event_id \
  --expect-distinct-identity
```

The second field is not incidental: each branch's cursor now points at its own
write event, which is what makes the streams independently replayable.

### `genos diff --expect-changed-path`

The same divergence through the structural diff, which reports the variable by
key instead of dumping working memory as a blob:

```bash
genos diff fork-1.json fork-2.json \
  --expect-changed-path state.working_memory.counter \
  --expect-changed-path state.event_cursor.last_event_id
```

```json
"memory_diff": [
  { "path": "state.working_memory.counter", "before": "10", "after": "20" }
]
```

Run [`../counterfactual-demo`](../counterfactual-demo) for the other half of the
definition: the same command on two forks nobody wrote to returns an empty diff,
identity differences included.

### `snapshot add-memory`

Records a memory on a snapshot's own branch. Unlike a working-memory variable, a
memory carries provenance: the branch that created it, when, and what it came
from.

```bash
genos snapshot add-memory --snapshot fork-1.json \
  --kind semantic --content "The API uses PostgreSQL" --source schema-probe \
  --snapshots agent-snapshots.jsonl --save \
  --events agent-events.jsonl --emit-events
```

The record lands in `state.memories` and its id in `semantic_memory.refs` (or
`episodic_memory.refs` with `--kind episodic`), so the index and the content
stay in step. `--emit-events` appends the `memory_created` event on that branch.

Diffing the branch that recorded nothing against the branch that did shows:

```text
MemoryDiff
  state.memories.01a0…152c (added)
    old: <absent>
    new: The API uses PostgreSQL
    provenance: created in branch 01a0…7d92 at 2026-08-14T15:26:30.973845200Z, source=schema-probe
  state.semantic_memory.refs.01a0…152c (added)
    old: <absent>
    new: 01a0…152c
```

One added memory is one entry, not one entry per field of the record — the
second line is its id appearing in the ref index. `(added)` is relative to the
diff's direction: `genos diff A2 A1` reads A1's side as the new one, so the
memory reads as added there. Reverse the arguments and the same memory reads as
`(removed)`.

## Continuous integration

`.github/workflows/ci.yml` runs this scenario on every push and pull request, on
both `ubuntu-latest` and `windows-latest`, and then re-asserts on the captured
output and the generated stores so a silently gutted script cannot pass.

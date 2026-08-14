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
6. Assert with `snapshot compare` that the two branches differ on exactly the
   two fields they should, then replay each branch to confirm the write events
   stayed on separate streams.

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
    and after their write — the store is append-only, so a snapshot id resolves
    to its latest line)
  - `.genos/demo/divergent-writes/agent-events.jsonl` (one write event per branch)
  - `.genos/demo/divergent-writes/forks/fork-1.json`, `fork-2.json`

Run [`../counterfactual-demo`](../counterfactual-demo) first if you want the
step before this one: two forks that start out logically identical. This demo
picks up where that one stops, at the moment the two branches stop agreeing.

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

## Continuous integration

`.github/workflows/ci.yml` runs this scenario on every push and pull request, on
both `ubuntu-latest` and `windows-latest`, and then re-asserts on the captured
output and the generated stores so a silently gutted script cannot pass.

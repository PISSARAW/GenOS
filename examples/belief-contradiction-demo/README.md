# Belief Contradiction Demo

Scenario implemented in this demo:

```text
S0 (no belief)
  -> record belief (api, is_bottleneck, true,  confidence=0.8) on S0
  -> record belief (api, is_bottleneck, false, confidence=0.7) on S0
       CONTRADICTION DETECTED  --  both beliefs now reference each other,
       both their statuses flipped to `Disputed`.
```

The invariant under test — GenOS detects contradictions as soon as the second
(opposite) belief lands on the same branch, surfaces the literal
`CONTRADICTION DETECTED` block to stderr, and tags both records with the
opposing belief id. The conflict is *not* resolved; that's the user's
explicit ask ("Pas besoin de résoudre le conflit").

| Snapshot | `(api, is_bottleneck, true).status`  | `(api, is_bottleneck, false).status` |
| ---      | ---                                   | ---                                    |
| `S0`     | `Disputed`, points at the new one    | `Disputed`, points at the first one   |

Detection rule: same `(subject, predicate)` with a different `object_value`
on the same branch is a contradiction. A confidence update on the same
triple is *not* a contradiction — only full triple disagreement is.

## What the script does

1. Create agent A and snapshot S0 (no belief yet).
2. Record `(api, is_bottleneck, true, 0.8)` on S0 — first call emits
   `memory_created`, no contradiction.
3. Record `(api, is_bottleneck, false, 0.7)` on S0 — the new belief is
   `Added`, detection fires, a second `memory_updated` event is appended to
   the branch stream carrying `kind: "contradiction"`, both records flip to
   `Disputed` and link to each other through `contradicts`.
4. Assert both records are `Disputed` and reference each other, both in the
   on-disk snapshot file and in the JSON output of the second call.
5. Assert the stderr block printed `CONTRADICTION DETECTED` and named both
   belief ids.
6. Replay S0's stream and confirm `last_sequence = 3` (create, update,
   contradiction marker — all on S0's branch).

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

- The script stops immediately on any assertion failure. The assertions
  live in the script itself, which exits non-zero on a failed `[ … ]` test.
- Final output prints
  `Demo OK: contradiction detected between (api, is_bottleneck, true, 0.8) and (api, is_bottleneck, false, 0.7)`
  plus the store and snapshot paths.
- Generated files live under:
  - `.genos/demo/belief-contradiction/agent-snapshots.jsonl`
  - `.genos/demo/belief-contradiction/agent-events.jsonl` (one `memory_created`,
    one `memory_updated`, one contradiction marker — all on S0's branch)
  - `.genos/demo/belief-contradiction/contradiction-notice.txt` (the literal
    stderr block captured by the demo)
  - `.genos/demo/belief-contradiction/snapshot-s0.json`

Run [`../belief-update-demo`](../belief-update-demo) first if you want the
fork-isolation equivalent: the same shape, but the divergence is a
confidence change on the same triple rather than a disagreement across two
different objects.

## CLI commands behind the demo

### `snapshot set-belief`

Insert-or-update a `(subject, predicate, object)` belief on a snapshot's own
branch. First call with a given triple creates a `Belief` with a fresh id
and a `memory_created` event. Subsequent calls with the same triple
overwrite `confidence` in place (the `Belief.id` stays the same) and emit a
`memory_updated` event whose payload carries `previous_confidence`.

```bash
genos snapshot set-belief \
  --snapshot snapshot-s0.json \
  --subject api --predicate is_bottleneck --object true \
  --confidence 0.8 \
  --snapshots agent-snapshots.jsonl --save \
  --events agent-events.jsonl --emit-events
```

When the new belief's `(subject, predicate)` already exists with a
*different* `object_value`, the write flips both beliefs to `Disputed`,
populates their `contradicts` lists with each other's ids, and emits a
second `memory_updated` marker event carrying
`{ "kind": "contradiction", "with": [<opposing_id>], ... }`. The CLI
prints a human-readable `CONTRADICTION DETECTED` block to **stderr** so
the JSON output on stdout stays machine-parseable; the structured
`contradictions` field on the JSON already carries the same ids.

```text
CONTRADICTION DETECTED
  belief <new_belief_id> contradicts belief <opposing_belief_id>:
    subject=api predicate=is_bottleneck
    object_value=false   <-->   object_value=<opposing>
```

The detection rule is branch-local: contradictions across branches are a
different question (cross-branch reasoning, not yet covered). Fork
isolation guarantees that a fork's belief is invisible to its sibling or
parent, so two beliefs disagreeing *across* branches never trigger this
detector — only disagreement *within* the same branch does.

### `snapshot get` (replay assertion)

Re-resolving the snapshot through the store confirms the contradiction
status survives the round-trip (it's persisted on the `Belief`, not just
returned by the CLI):

# Snapshot timeline demo

Drives the `genos` CLI through the first **alternative-timeline** case:
a single branch advances through several checkpoints (`S0 → S1 → S2 → S3`),
the user rewinds a later checkpoint to an earlier one (`restore S1`
against `S3`), and forks off the rewound point (`fork S1 → X1`).

The result is a literal lineage tree:

```text
S0
└── S1
    ├── S2
    │   └── S3
    └── X1
```

## What it proves

- **`snapshot checkpoint`** mints a fresh `snapshot_id` on the same
  branch — distinct from `snapshot save`, which is id-stable for
  round-trip into the store. A series of checkpoints produces a series
  of distinct ids.
- **`snapshot lineage`** walks the event store and renders the resulting
  `LineageDag` as either plain text (`├──` / `└──` connectors) or
  structured JSON. The JSON form is what the demo's assertions use.
- **History is preserved by construction.** The event store is
  append-only; every checkpoint, restore, and fork stamps an event.
  Replaying the branch shows the full chronology, not just the latest
  state.

## How to run

### Bash

```bash
bash examples/snapshot-timeline-demo/run-demo.sh
```

### PowerShell

```powershell
pwsh examples/snapshot-timeline-demo/run-demo.ps1
```

The script ships with a UTF-8 BOM so it parses cleanly under Windows
PowerShell 5.1 as well as PowerShell 7+ — important because the demo
prints `├──` / `└──` connectors and the parser must read those multi-byte
sequences as a single string token, not split them mid-byte. If you
re-save the file with an editor that strips the BOM, add it back with:

```powershell
$path = 'examples/snapshot-timeline-demo/run-demo.ps1'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $True))
```

Both scripts:

1. `cargo build -p genos-cli`.
2. `init` + `agent create` + `snapshot create` (S0, counter=10).
3. `set-var counter=20` → `snapshot checkpoint` (S1, fresh id).
4. `set-var counter=30` → `snapshot checkpoint` (S2).
5. `set-var counter=40` → `snapshot checkpoint` (S3).
6. `snapshot restore --snapshot S3 --source S1` (S3 rewound to 20).
7. `agent fork-from-snapshot --snapshot S1 --count 1` (X1).
8. `snapshot lineage --snapshot S0 --format text` (tree rendering).
9. `snapshot lineage --snapshot S0 --format json` + assertions:
   - 5 edges on the dag.
   - S1 has 2 children (`S2` mutation, `X1` fork).
   - S2 has 1 child (`S3` mutation).
   - X1 is a leaf.

## Design notes

### Why `checkpoint` is a new subcommand, not a `save` flag

`snapshot save` is **id-stable** — calling it twice on the same snapshot
appends the same id twice, and `snapshot get` / `snapshot list` resolve
an id to its latest line. That's the right behaviour for "I edited this
snapshot, write it back" but it's the wrong behaviour for "I want to
record a new checkpoint on the timeline". A checkpoint needs to mint a
fresh id *and* keep the branch alive.

`snapshot checkpoint` is the new primitive. `snapshot save` stays
id-stable for round-trip.

### Why `Mutation`, not `Fork`, for the checkpoint edge

`LineageRelation::Fork` would have been tempting, but `fork` in the
existing taxonomy means "branch changes, identity changes, agent
changes". A checkpoint keeps branch, agent, and identity of the source
— only the snapshot id is new. `LineageRelation::Mutation` is the right
fit: same branch, fresh id, state mutated.

### Why `tree_at` picks the earliest parent for shared children

In this demo, `S3` ends up with two incoming edges: `S2 → S3` (the
checkpoint that minted it) and `S1 → S3` (the restore that rewound it
later). The tree builder picks the *earliest* edge's parent (here, `S2`)
to anchor `S3` in the rendered tree. The later edge stays on the dag
as an audit-trail note (the `edges` count is still 5) but doesn't
re-parent the child.

This matches chronological intuition: a snapshot's origin is the edge
that minted it, not the one that rewound it.

### Why the demo's restore rewinds `S3` rather than `S4`

The design asks for `S0 → S1 → S2 → S3`, then "restore `S1`", then "fork
`S1` → `X1`". "Restore `S1`" against what? The most interesting case is
to restore a *later* checkpoint (`S3`) back to `S1`'s state — that
shows the restore edge landing on a snapshot that already has an
existing parent (`S2`), exercising the multi-incoming-edge handling
above. The fork off `S1` then has a sibling (`X1`) that demonstrates
fork semantics on a rewound branch.

## Output

The scripts leave their artefacts under `.genos/demo/snapshot-timeline/`:

- `agent-snapshots.jsonl` — six snapshot-store lines: S0 (twice: initial
  save + the set-var rewrite), S1, S2, S3 (twice: post-checkpoint + post
  restore), X1.
- `agent-events.jsonl` — seven events in order:
  `memory_updated`, `snapshot_created`, `memory_updated`,
  `snapshot_created`, `memory_updated`, `snapshot_created`, `restored`,
  `fork_created`.
- `snapshot-s{0,1,2,3}.json` — per-checkpoint snapshot files.
- `forks/fork-1.json` — the X1 fork file.

# Agent primitives

GenOS exposes one canonical lifecycle vocabulary. The unit being manipulated is
an atomic capsule containing the agent snapshot, its live or checkpointed world,
its lineage, restorable components, and its execution budget.

```text
genos agent init
genos agent snapshot <CAPSULE_ID>
genos agent restore <CAPSULE_ID>
genos agent fork <CAPSULE_ID> --branch A=HYPOTHESIS --branch B=HYPOTHESIS
genos agent mutate <GENOME> --exploration 0.15 --risk -0.10
genos agent run <CAPSULE_ID> --command "cargo test"
genos agent diff <SNAPSHOT_A> <SNAPSHOT_B>
genos agent merge <COGNITIVE_MERGE_MANIFEST>
genos agent lineage --snapshot <SNAPSHOT_ID>
genos agent replay --snapshot <SNAPSHOT_ID>
```

## Bootstrap

`agent init` initializes the local repository. Genome and initial logical-state
construction are currently explicit so their artifacts remain inspectable:

```text
genos agent init
genos agent create --name atlas --role software_engineer --out atlas.yaml
genos snapshot create --agent atlas.yaml --out atlas-s0.json
genos capsule create --snapshot atlas-s0.json --budget-steps 100
```

The last command returns the capsule identifier used by `run`, `snapshot`, and
`fork`.

## Semantics

- `snapshot`, `restore`, `fork`, and `run` act on complete agent-world capsules.
- `mutate` creates a new genome; it never silently rewrites its source.
- `diff` compares logical state rather than generated text.
- `merge` consumes structured branch experiences and reconciles evidence,
  contradictions, context, and uncertainty.
- `lineage` and `replay` use persisted events; they do not ask a model to invent
  history.
- A non-zero command exit is reported as failure after its output and updated
  capsule are persisted. `--allow-failure` keeps the CLI exit successful.

The older `snapshot`, `capsule`, `world`, `experiment`, `diff`, and `replay`
groups remain available as advanced plumbing and compatibility APIs.

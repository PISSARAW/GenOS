# Extreme critical-system refactor experiment

This is a deterministic, executable scale model of a multi-year refactor. The
fixture is intentionally small enough for CI, while exercising the same GenOS
orchestration path intended for a multi-million-line repository.

```text
S0
├── event-driven
│   ├── Kafka
│   ├── NATS
│   └── DB outbox
├── modular-monolith
│   ├── vertical slices
│   └── domain modules
└── async-workers
    ├── Redis queues
    └── custom scheduler
```

Each leaf receives an isolated workspace, modifies its architecture files, and
runs four real stages:

1. public-contract tests;
2. deterministic benchmark;
3. deterministic fuzzing;
4. data-migration validation.

GenOS then computes workspace diffs, reconstructs the recursive lineage,
evaluates correctness/throughput/migration safety/operability, selects a branch
with explicit weights, explains rejected hypotheses, and performs a cognitive
merge of reusable findings. Cognitive merge transfers evidence and discoveries;
it does not silently merge source code or state.

Run the complete public scenario:

```powershell
cargo test -p genos-runtime --test extreme_refactor_experiment -- --nocapture
```

Expected winner: `DB outbox`. Findings from every lineage remain available for
the final implementation.

# Project use of canonical agent primitives

Project runners and the canonical CLI now share the same ten-operation
vocabulary. Every persisted project report contains `primitive_trace`, an
ordered audit of the operations that actually occurred. `experiment ...` is
the orchestration layer and accepts either a complete manifest or direct
runtime inputs plus a reusable plan. Each trace entry maps directly to the
equivalent `genos agent ...` primitive.

| Orchestrator | Direct input mode |
| --- | --- |
| Workspace refactor | `workspace --repo PATH --plan PATH` |
| Incident search | `incident --snapshot REF --evidence PATH --search-plan PATH` |
| Scientific research | `scientific --dataset PATH --research-plan PATH` |
| Security coevolution | `security-coevolution --environment PATH --evolution-plan PATH` |
| Unknown-cause bug | `bug-investigation --repo PATH --plan PATH` |

Manifest and direct modes are mutually exclusive. Partial direct input sets
are rejected before the runtime creates any world. CLI inputs replace the
corresponding plan fields (`seed_dir`, `evidence`, `records`, or `scenarios`),
then the result is deserialized into the same typed runtime manifest used by
the original mode.

| Project | Canonical lifecycle |
| --- | --- |
| Calculator counterfactual | `init → snapshot → fork → run → diff → merge → lineage` |
| Extreme refactor | `init → snapshot → recursive fork → run → diff → merge → lineage` |
| Temporal causal simulator | `snapshot → restore → fork → replay → diff → lineage` |
| Adaptive incident search | `snapshot → fork → mutate → replay → run → recursive fork → lineage` |
| Scientific research | `snapshot → fork → run → replay → restore → merge → lineage` |
| Security coevolution | `snapshot → fork → mutate → run → diff → lineage` |
| Unknown-cause bug | `init → snapshot → fork → run → diff → lineage` (`merge` explicitly deferred) |

The trace does not claim that every project needs every primitive. In
particular, winner selection is not silently reported as a cognitive merge,
and simulations that do not restore state do not fabricate a `restore` entry.

The low-level manual equivalent remains:

```text
genos agent init
genos agent snapshot <CAPSULE_ID>
genos agent restore <CAPSULE_ID>
genos agent fork <CAPSULE_ID> --branch A=HYPOTHESIS
genos agent mutate <GENOME> --exploration 0.1 --risk -0.05
genos agent run <CAPSULE_ID> --command "cargo test"
genos agent diff <SNAPSHOT_A> <SNAPSHOT_B>
genos agent merge <MERGE_MANIFEST>
genos agent lineage --snapshot <SNAPSHOT_ID>
genos agent replay --snapshot <SNAPSHOT_ID>
```

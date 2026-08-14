# GenOS

Genome Operating System for Agents.

GenOS is a provider-agnostic runtime for reproducible, forkable, and inspectable agents.

## Core invariant

An agent is not only a prompt.

```text
Agent = Genome + State + World + Event History
```

## Monorepo layout

```text
crates/
	genos-core      # pure domain model (no docker/db/provider/api coupling)
	genos-runtime   # runtime lifecycle traits
	genos-world     # world isolation abstraction
	genos-store     # event/snapshot persistence traits
	genos-model     # provider-neutral model interfaces
	genos-tools     # tool interfaces
	genos-eval      # evaluation primitives
	genos-api       # HTTP API shell
	genos-cli       # `genos` CLI

python/
	genos_sdk
	providers
	experiments
	notebooks

web/console
spec/
docs/adr/
examples/
benchmarks/
docker/
```

## M0 status

Implemented:

- Strong typed IDs in `genos-core`
- `AgentGenome`, `AgentState`, `AgentSnapshot`, `AgentEvent`, lineage/diff primitives
- Portable schemas in `spec/`
- ADR baseline in `docs/adr/`
- CLI bootstrap commands:
	- `genos init`
	- `genos agent create`
	- `genos agent inspect`
	- `genos agent fork-from-snapshot`
	- `genos snapshot create/save/get/list/compare`
	- `genos snapshot set-var/check-var/set-cognition/add-memory`
	- `genos world create/snapshot/fork/diff/destroy`
	- `genos world read-file/write-file/check-file`
	- `genos replay basic/from-snapshot`
	- `genos diff` — structural diff of two snapshots: empty for untouched forks,
	  one entry per changed path otherwise (`--format text` for a report)
- Runnable proofs of fork isolation in `examples/`:
	- `counterfactual-demo` — two forks start logically identical with distinct identity
	- `divergent-writes-demo` — two branches write the same variable differently
	  while the parent keeps its pre-fork value, then one branch records a
	  memory the other never sees
	- `divergent-worlds-demo` — two forked worlds write the same file differently
	  while the parent world keeps its pre-fork contents

Not implemented yet:

- Full counterfactual experiment orchestration pipeline
- Cognitive merge policy and automated winner promotion

## Quickstart

```bash
cargo run -p genos-cli -- init
cargo run -p genos-cli -- agent create --name atlas --role software_engineer
cargo run -p genos-cli -- agent inspect .genos/agents/atlas.yaml --format json
cargo run -p genos-cli -- snapshot create --agent .genos/agents/atlas.yaml

# world flow (directory provider)
cargo run -p genos-cli -- world create --provider directory --format json
cargo run -p genos-cli -- world snapshot --provider directory --world-id <WORLD_ID> --format json
cargo run -p genos-cli -- world fork --provider directory --snapshot-id <SNAPSHOT_ID> --count 2 --format json
cargo run -p genos-cli -- world diff --provider directory --world-a <WORLD_ID_A> --world-b <WORLD_ID_B> --format json
```

## Principles

- Provider neutrality is mandatory
- Event sourcing is the source of historical truth
- Fork isolation is a hard invariant
- Cognitive merge is deferred beyond V0
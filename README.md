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
	- `genos snapshot create`

Not implemented yet:

- Real world provider execution and isolation runtime
- Event store backend
- Fork engine
- Replay engine
- Counterfactual experiment orchestration

## Quickstart

```bash
cargo run -p genos-cli -- init
cargo run -p genos-cli -- agent create --name atlas --role software_engineer
cargo run -p genos-cli -- agent inspect .genos/agents/atlas.yaml --format json
cargo run -p genos-cli -- snapshot create --agent .genos/agents/atlas.yaml
```

## Principles

- Provider neutrality is mandatory
- Event sourcing is the source of historical truth
- Fork isolation is a hard invariant
- Cognitive merge is deferred beyond V0
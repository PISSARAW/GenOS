# GenOS

## The open source operating system for reproducible AI agents

GenOS is a provider-neutral runtime for building AI agents whose **state, memory, world, and history are explicit, versioned, forkable, and inspectable**.

An agent is more than a prompt:

```text
Agent = Genome + State + World + Event History
```

GenOS lets teams save an agent, fork it into counterfactual branches, compare outcomes, and replay what happened—without requiring an LLM call to create a clone.

## Why GenOS?

Modern agents are difficult to reproduce because identity, memory, tools, environment, and execution history are often mixed together. GenOS separates these concerns so teams can:

- fork an agent from a snapshot without invoking a model;
- preserve the same logical state while assigning new identities and branches;
- isolate files and worlds between branches;
- record events, tool calls, memories, beliefs, and provenance;
- compare snapshots structurally;
- replay branch history;
- keep model and tool providers interchangeable.

## Current capabilities

- Strongly typed agent, genome, snapshot, branch, world, event, and memory identifiers
- Agent snapshots, restoration, checkpoints, and lineage tracking
- Counterfactual forks with isolated `AgentId`, `BranchId`, and event streams
- Structural snapshot diffs
- Event-sourced local persistence using JSONL
- Variable, memory, belief, evidence, and tool-output tracking
- Directory and Git worktree world providers
- File isolation checks
- CLI workflows for agents, snapshots, worlds, replay, inspection, and diff
- Ten canonical `agent` primitives spanning initialization, snapshot/restore,
  fork/mutation/run, diff/merge, lineage, and replay
- Portable JSON Schemas in `spec/`
- Runnable demonstrations in `examples/`

## Example: clone an agent without an LLM

```text
Agent A
  │
  └── Snapshot S0
        │
        ├── Fork A1  (new AgentId, new BranchId, same logical state)
        └── Fork A2  (new AgentId, new BranchId, same logical state)
```

Both clones start from the same genome, state, world reference, and minimal memory. Their subsequent events remain isolated and independently replayable.

## Quickstart

```bash
cargo run -p genos-cli -- init
cargo run -p genos-cli -- agent create --name atlas --role software_engineer
cargo run -p genos-cli -- agent inspect .genos/agents/atlas.yaml --format json
cargo run -p genos-cli -- snapshot create --agent .genos/agents/atlas.yaml
```

The canonical lifecycle surface is deliberately small:

```bash
genos agent init
genos agent snapshot <CAPSULE_ID>
genos agent restore <CAPSULE_ID>
genos agent fork <CAPSULE_ID> --branch A=baseline --branch B=alternative
genos agent mutate <GENOME> --exploration 0.15 --risk -0.10
genos agent run <CAPSULE_ID> --command "cargo test"
genos agent diff <SNAPSHOT_A> <SNAPSHOT_B>
genos agent merge <COGNITIVE_MERGE_MANIFEST>
genos agent lineage --snapshot <SNAPSHOT_ID>
genos agent replay --snapshot <SNAPSHOT_ID>
```

See [`docs/AGENT_PRIMITIVES.md`](docs/AGENT_PRIMITIVES.md) for exact semantics
and the bootstrap from a genome to an executable agent-world capsule.

Create and fork snapshots:

```bash
cargo run -p genos-cli -- snapshot create --agent .genos/agents/atlas.yaml
cargo run -p genos-cli -- agent fork-from-snapshot \
  --snapshot .genos/snapshots/<SNAPSHOT_ID>.json \
  --count 2 --save --format json
```

Run the fork-isolation demonstrations:

```bash
./examples/counterfactual-demo/run-demo.sh
./examples/divergent-writes-demo/run-demo.sh
./examples/divergent-worlds-demo/run-demo.sh
```

On Windows, use the corresponding `run-demo.ps1` scripts.

## Repository layout

```text
crates/
  genos-core      # Pure domain model and invariants
  genos-runtime   # Runtime lifecycle traits
  genos-world     # World isolation providers
  genos-store     # Event and snapshot persistence
  genos-model     # Provider-neutral model interfaces
  genos-tools     # Tool interfaces
  genos-eval      # Evaluation primitives
  genos-api       # HTTP API shell
  genos-cli       # `genos` command-line interface

spec/             # Portable JSON Schemas and genome specification
docs/             # Architecture decisions and roadmap
examples/         # Runnable proofs and workflows
python/           # SDK, providers, and experiments
web/console       # Console foundations
```

## Architecture principles

- **Provider neutrality:** models, tools, and worlds are replaceable.
- **Event sourcing:** event history is the source of historical truth.
- **Fork isolation:** branches must not leak state or writes into one another.
- **Explicit provenance:** memories and beliefs retain their origin.
- **Deferred cognitive merge:** branch results are compared before promotion or merge.

## Roadmap

The project is currently in the early `0.0.x` phase. Upcoming milestones include end-to-end counterfactual experiments, durable transactional storage, provider integrations, branch evaluation, cognitive merge policies, and a richer API and web console.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) and the architecture decisions in [`docs/adr/`](docs/adr/).

## Contributing

GenOS is open source and welcomes contributions. Good starting points include tests for fork invariants, new model/tool/world providers, CLI improvements, stronger schemas, and integration examples.

Before opening a pull request, run:

```bash
cargo fmt --all -- --check
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

## License

The project is intended to be released under the Apache License, Version 2.0, as declared in the workspace metadata.

## Keywords

AI agents · agent runtime · agent memory · agent state · event sourcing · reproducible AI · autonomous agents · multi-agent systems · counterfactual AI · snapshots · branching · lineage · provenance · Rust · open source

<!-- Suggested social tags: use selectively, not all at once. -->

#AIAgents #OpenSourceAI #AgenticAI #AutonomousAgents #ReproducibleAI #MultiAgentSystems #EventSourcing #RustLang #LLM #MachineLearning

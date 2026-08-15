# GenOS

**A counterfactual runtime for reproducible AI agents.**

[![CI](https://github.com/PISSARAW/GenOS/actions/workflows/ci.yml/badge.svg)](https://github.com/PISSARAW/GenOS/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-stable-orange.svg)](rust-toolchain.toml)
[![Status](https://img.shields.io/badge/status-pre--alpha-yellow.svg)](docs/ROADMAP.md)

GenOS makes an agent's identity, state, memory, environment, and history explicit. It can checkpoint an agent and its world, fork that checkpoint into isolated branches, execute competing hypotheses, compare the outcomes, and replay how each result was produced.

```text
Agent = Genome + State + World + Event History
```

GenOS is provider-neutral and model calls are not required to snapshot, restore, fork, inspect, or diff an agent.

> [!IMPORTANT]
> GenOS is an experimental, pre-alpha project. Its core invariants are tested, but APIs, schemas, storage formats, and command names may change before `0.1.0`. It is not yet intended for production workloads.

## Why GenOS?

Most agent frameworks optimize the next model call. GenOS focuses on what happens around and between those calls: preserving state, isolating alternatives, tracing causality, and turning experiments into reproducible artifacts.

- **Reproduce:** checkpoint the complete logical state of an agent-world pair.
- **Branch:** explore alternatives from the same starting point without state leakage.
- **Inspect:** retain lineage, beliefs, memories, evidence, tool outputs, and provenance.
- **Evaluate:** compare branches with constraints, multiple objectives, and Pareto selection.
- **Replay:** reconstruct state or revisit a past decision in a controlled causal universe.
- **Integrate:** swap model, tool, storage, and world providers behind neutral interfaces.

## How it works

```text
                         +--> Branch A --> execute --> evidence --+
Agent + World --> S0 ----+                                     +--> evaluate / merge --> S1
                         +--> Branch B --> execute --> evidence --+
```

A snapshot is a reproducible checkpoint. A fork receives a new agent and branch identity while preserving the logical starting state. Each branch gets an isolated world and event stream. Results can then be diffed, evaluated, replayed, or reconciled through an explicit cognitive merge.

## Current capabilities

| Area | Available today |
| --- | --- |
| Agent state | Typed genomes, state, memories, beliefs, evidence, tool outputs, and provenance |
| Versioning | Snapshots, restoration, checkpoints, structural diffs, lineage DAGs, and replay |
| Isolation | Directory and Git worktree worlds with path-safety and branch-isolation tests |
| Experiments | Workspace, temporal, incident, scientific, security, heredity, selection, and bug-investigation workflows |
| Evolution | Genome mutation, evidence-based breeding, trait inference, and budgeted branch evolution |
| Evaluation | Multi-objective scoring, hard constraints, Pareto assessment, and winner selection |
| Merge | Evidence packets, typed knowledge graphs, contextual synthesis, and reviewed parent updates |
| Interfaces | Rust crates, a `genos` CLI, portable JSON Schemas, a versioned GenOS protocol, an MCP server, and an HTTP health endpoint |

See the [implementation status](docs/adr/IMPLEMENTATION_STATUS.md) for the exact boundary between accepted design and executable coverage.

## Quick start

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) stable, including Cargo
- Git (required for Git worktree worlds)
- Bash or PowerShell for the runnable demos

### Build and inspect the CLI

```bash
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
cargo build --workspace
cargo run -p genos-cli -- --help
```

Initialize a local GenOS workspace and create an agent:

```bash
cargo run -p genos-cli -- init
cargo run -p genos-cli -- agent create --name atlas --role software_engineer
cargo run -p genos-cli -- agent inspect .genos/agents/atlas.yaml --format json
cargo run -p genos-cli -- snapshot create --agent .genos/agents/atlas.yaml
```

Generated runtime data is stored under `.genos/` and is ignored by Git.

### Run the isolation proof

```bash
./examples/counterfactual-demo/run-demo.sh
```

On Windows:

```powershell
./examples/counterfactual-demo/run-demo.ps1
```

The demo creates one snapshot, forks two logically identical agents without an LLM call, verifies distinct identities and isolated event streams, and proves that untouched forks have an empty logical diff.

More runnable scenarios are catalogued in [examples/README.md](examples/README.md).

## Canonical agent lifecycle

GenOS exposes ten composable agent primitives:

```bash
genos agent init
genos agent snapshot <CAPSULE_ID>
genos agent restore <CAPSULE_ID>
genos agent fork <CAPSULE_ID> --branch A=baseline --branch B=alternative
genos agent mutate <GENOME> --exploration 0.15 --risk -0.10
genos agent run <CAPSULE_ID> --command "cargo test"
genos agent diff <SNAPSHOT_A> <SNAPSHOT_B>
genos agent merge <MERGE_MANIFEST>
genos agent lineage --snapshot <SNAPSHOT_ID>
genos agent replay --snapshot <SNAPSHOT_ID>
```

Read [Agent primitives](docs/AGENT_PRIMITIVES.md) for their exact semantics and [Counterfactual OS](docs/COUNTERFACTUAL_OS.md) for the integrated execution model.

## Architecture

The runtime is split into narrow crates so domain invariants do not depend on a model vendor, database, API, or execution backend.

```text
crates/
  genos-core      Domain types and invariants
  genos-runtime   Agent lifecycles and experiment orchestration
  genos-world     Isolated directory and Git worktree worlds
  genos-store     Events, snapshots, artifacts, and persistence
  genos-model     Provider-neutral model interfaces
  genos-tools     Provider-neutral tool interfaces
  genos-eval      Evaluation and selection primitives
  genos-api       HTTP API foundation
  genos-cli       Command-line interface
  genos-protocol  Versioned public lifecycle tool contract

spec/             Portable JSON Schemas and genome specification
docs/             Concepts, architecture decisions, and roadmap
examples/         Runnable proofs and end-to-end experiments
integrations/mcp/ MCP adapter for Codex and other compatible clients
python/           SDK and provider placeholders
web/console/      Web console placeholder
```

The core architectural commitments are provider neutrality, event-sourced history, fork isolation, explicit provenance, content-addressed artifacts, and reviewed cognitive merge. Design rationale is recorded in the [architecture decision records](docs/adr/).

### Agent-environment integration

GenOS distinguishes an environment that **uses GenOS** from a model provider
that **GenOS uses**. OpenAI Codex is a GenOS-native environment through
MCP; an OpenAI API model is a separate, interchangeable model provider.

```text
OpenAI Codex ---- MCP ----> GenOS protocol ----> GenOS runtime
GenOS runtime ------------> OpenAI model API (optional)
```

The same MCP tool surface works with Codex and other MCP-capable clients. Build
and run it with `cargo run -p genos-mcp -- stdio`, or follow the
[Codex integration guide](docs/integrations/CODEX_MCP.md). See
[ADR-0021](docs/adr/ADR-0021-protocol-interoperability-codex.md) for the
compatibility boundary.

## Project status and roadmap

GenOS is at `0.0.1`. The repository contains substantial executable research prototypes, but distribution, remote providers, transactional orchestration, API coverage, and the web console remain early or incomplete.

The path to `0.1.0` focuses on a stable end-to-end counterfactual experiment, hardened persistence, broader API coverage, external model providers, and release packaging. See the [roadmap](docs/ROADMAP.md).

## Documentation

- [Documentation index](docs/README.md)
- [Agent primitives](docs/AGENT_PRIMITIVES.md)
- [Counterfactual OS](docs/COUNTERFACTUAL_OS.md)
- [GenOS protocol](docs/GENOS_PROTOCOL.md)
- [OpenAI Codex MCP integration](docs/integrations/CODEX_MCP.md)
- [Genome specification](spec/GENOME_SPEC.md)
- [Phenotype and divergence](docs/phenotype.md)
- [Architecture decisions](docs/adr/)
- [Roadmap](docs/ROADMAP.md)
- [Examples catalogue](examples/README.md)

## Contributing

Contributions are welcome, especially focused changes that strengthen an invariant, improve a public interface, add an integration, or turn an existing scenario into a reproducible test.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues should be reported through the process in [SECURITY.md](SECURITY.md), not through a public issue.

## Community and governance

- Questions and usage help: [SUPPORT.md](SUPPORT.md)
- Decision-making and maintainer responsibilities: [GOVERNANCE.md](GOVERNANCE.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

## Authorship and AI assistance

GenOS was conceived and is directed by [PISSARAW](https://github.com/PISSARAW). AI systems have been used extensively as implementation and writing tools during its development. The project's vision, underlying research, architectural decisions, feature design, priorities, and final technical judgments are the author's own.

AI-assisted output is reviewed, tested, revised, or rejected before it becomes part of the project. Responsibility for the published code, documentation, and claims remains with the maintainer.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

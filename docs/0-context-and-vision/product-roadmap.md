# GenOS Product Roadmap & Release Milestones

## 1. Vision & Strategy

GenOS is an experimental runtime for **Git-like branching and deterministic
replay of AI-agent state**. This roadmap describes intended milestones toward
a dependable counterfactual runtime; future milestones are targets, not claims
about capabilities available today.

```text
[v0.0.1 Foundations] ---> [v0.1.0 Developer Preview] ---> [v0.2.0 Biomimetic Swarms]
                                                                    |
[v1.0.0 Production Enterprise OS] <--- [v0.5.0 Causal Lab & Eval] <-+
```

---

## 2. Release Milestones

### Milestone 1: v0.0.1 — Executable Foundations (Current Baseline)
*Objective: Implement core data structures, deterministic primitives, and local capsule execution.*

- **Core Primitives**: Typed Genome, Phenotype, Capsule, Epistemic Beliefs, Memory, Evidence, and Causal DAGs (`genos-core`).
- **World Sandboxing**: Isolated directory worlds and Git worktree backends (`genos-world`).
- **Lifecycle Operations**: Atomic snapshot creation, restore, counterfactual fork, diff, and state replay (`genos-runtime`).
- **Research Engines**: Initial cognitive merge, branch evolution, heredity experiments, and simulated annealing (`genos-synaptic`, `epsilon_sa`).
- **Protocol Interoperability**: Initial `v1alpha1` Model Context Protocol (MCP) JSON-RPC adapter over STDIO and HTTP (`genos-protocol`).
- **CLI Suite**: Unified `genos` CLI covering agent, capsule, snapshot, world, dev, and experiment subcommands (`genos-cli`).

---

### Milestone 2: v0.1.0 — Coherent Developer Preview (Next Target)
*Objective: Deliver a robust, frictionless local developer workflow with full persistence and external model support.*

#### Deliverables:
1. **Capsule Orchestration Default**: Make the atomic `Agent-World Capsule` the standard boundary for all runtime executions and CLI operations.
2. **Persistent Storage Layer**: Production-grade SQLite and PostgreSQL adapters for snapshots, event streams, and Content-Addressable Storage (CAS) in `genos-store`.
3. **Provider Connectors**: Standardized model adapters for OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), Ollama, and deterministic mock/replay fixtures in `genos-model`.
4. **Resilience & Cleanup**: Robust cleanup of temporary Git worktrees, cancellation tokens, timeout guards, and partial-result salvage.
5. **Schema Stability**: Versioned JSON schemas for genomes, snapshots, events, and MCP tool declarations.
6. **Documentation & DX**: Complete onboarding guide, architecture tour, quickstart tutorial, and automated installation scripts.

#### Exit Criteria:
- Zero-configuration local setup on Linux, macOS, and Windows.
- Full end-to-end execution of a counterfactual branch, evaluation, and cognitive merge without live LLM calls (via replay).
- 100% CI pass rate across unit tests, integration tests, and clippy lints.

---

### Milestone 3: v0.2.0 — Resilient & Multi-Agent Swarms
*Objective: Introduce biomimetic self-healing, stigmergic coordination, and distributed swarm consensus.*

#### Deliverables:
1. **Biomimetic Triggers**: Automatic runtime detection of reasoning stagnation and execution of:
   - **Apoptosis**: Graceful teardown of corrupted or looping agents.
   - **Cryptobiosis**: Freeze and resume upon API rate limits or network degradation.
   - **Hypermutation**: Temperature and prompt diversification during cognitive deadlocks.
2. **Stigmergic Collaboration**: Shared workspace coordination among agents via environmental markers and AST change notifications without message bottlenecks.
3. **Swarm Consensus Engine**: Multi-agent quorum protocols for collective decision-making and cross-validation of complex code refactors.
4. **Horizontal Gene Transfer (HGT)**: Runtime sharing of successful tool configurations and reasoning operons across disparate agent lineages.

---

### Milestone 4: v0.5.0 — Enterprise Evaluation & Causal Laboratory
*Objective: Provide comprehensive multi-objective evaluation, formal verification, and observability.*

#### Deliverables:
1. **Multi-Objective Pareto Engine**: Automated ranking of counterfactual trajectories across correctness, financial cost, token latency, and security invariants in `genos-eval`.
2. **Causal Incident Studio**: Interactive debugging tools to isolate, bisect, and diagnose historical agent failures with step-by-step counterfactual mutation.
3. **Security Coevolution Testbed**: Automated red-team vs. blue-team agent simulations in isolated network sandboxes.
4. **Observability & Web UI**: Real-time visual Causal DAG explorer, lineage tree visualizer, and live token budget telemetry (`genos-api`).
5. **IDE Integrations**: First-class extensions for Visual Studio Code, JetBrains, and Antigravity IDE.

---

### Milestone 5: v1.0.0 — Production-readiness target
*Objective: validate distributed scale, zero-trust sandboxing, high-availability storage, and documented compliance controls.*

#### Deliverables:
1. **Distributed CAS Storage**: High-throughput distributed content-addressable storage supporting S3, GCS, and Azure Blob storage with edge caching.
2. **MicroVM & Micro-Sandbox Isolation**: Firecracker microVM and gVisor sandboxing for untrusted arbitrary code and system execution.
3. **Multi-Node Cluster Orchestration**: Kubernetes operator and distributed scheduling for executing thousands of counterfactual agent branches concurrently.
4. **Regulatory Audit & Attestation**: Cryptographically signed execution certificates verifying tamper-proof event logs for EU AI Act, SOC2 Type II, and HIPAA compliance.
5. **Formal SLAs & Enterprise Support**: Enterprise-ready backward compatibility guarantees, zero-downtime schema migrations, and 24/7 reliability.

---

## 3. Governance & Contribution Cadence

- **RFC Process**: Architectural additions must be proposed via Architecture Decision Records (ADRs) in `docs/2-architecture/adrs/`.
- **Release Cycle**: Minor releases every 6 weeks; patch releases bi-weekly.
- **Backward Compatibility**: Semantic versioning strictly enforced post-v0.1.0. All public event schemas and snapshot formats maintain 1-year deprecation windows.

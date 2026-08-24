<p align="center">
  <img src="../assets/brand/genos-logo.png" width="128" alt="GenOS official logo">
</p>

# GenOS Documentation Portal

[![Release](https://img.shields.io/badge/release-v0.0.1--alpha.1-blue.svg)](https://github.com/PISSARAW/GenOS/releases/tag/v0.0.1-alpha.1)
[![Proof](https://img.shields.io/badge/evidence-reproducible-blue.svg)](7-benchmarks-and-comparisons/proof-and-benchmark-status.md)
[![Rust Core](https://img.shields.io/badge/engine-Rust-orange.svg)](1-onboarding-and-setup/architecture-tour.md)

GenOS explores **Git-like branching and deterministic replay for AI-agent
state**. It is pre-alpha research software: the documentation separates
implemented behavior, executable proofs, design proposals, and unmeasured
claims.

The implemented core provides versioned agent state, event histories,
snapshot/fork workflows, diff and replay primitives, and isolated-world
experiments. Broader distributed, security, and resilience capabilities are
roadmap targets unless linked to an executable proof.

---

## 🤖 AI-Native Directives

If you are an autonomous AI agent operating on this repository, strictly adhere to these directives:
1. **System Prompt & Role Guide**: Read [.ai/system-prompt.md](.ai/system-prompt.md)
2. **Documentation & Maintenance Policy**: Read [.ai/doc-update-policy.md](.ai/doc-update-policy.md)
3. **Core Invariants & Integrity Rules**: Read [.ai/invariants.md](.ai/invariants.md)

---

## 🏛️ System Architecture Overview

The diagram is a conceptual target architecture. Consult the
[implementation status](2-architecture/adrs/IMPLEMENTATION_STATUS.md) before
treating a component or boundary as available.

```text
                                  ┌──────────────────────────────────┐
                                  │      AGENT GENOME (Genotype)     │
                                  └─────────────────┬────────────────┘
                                                    │ Instantiates
                                                    ▼
                                  ┌──────────────────────────────────┐
                                  │   AGENT-WORLD CAPSULE (S0)       │
                                  │  - Beliefs & Epistemic State     │
                                  │  - Directory-backed World       │
                                  │  - Content-Addressable Event Log │
                                  └─────────┬──────────────┬─────────┘
                                            │ Fork         │ Fork
                     ┌──────────────────────┴───┐      ┌───┴──────────────────────┐
                     │   Speculative Branch A   │      │   Speculative Branch B   │
                     │  - Strategy: Quick Patch │      │  - Strategy: Deep Refactor│
                     │  - Invariant Check: FAIL │      │  - Invariant Check: PASS │
                     └─────────────┬────────────┘      └───────────┬──────────────┘
                                   │ Apoptosis                     │ Experience Packet
                                   ▼                               ▼
                             [Quarantined]             ┌──────────────────────────┐
                                                       │  COGNITIVE MERGE ENGINE  │
                                                       │   (Epistemic Graph Sync) │
                                                       └───────────┬──────────────┘
                                                                   │ Commits
                                                                   ▼
                                                       ┌──────────────────────────┐
                                                       │ AGENT-WORLD CAPSULE (S1) │
                                                       └──────────────────────────┘
```

---

## 🗺️ Master Documentation Index

### [Module 0: Contexte et Vision](0-context-and-vision/)
- [Counterfactual OS Paradigm](0-context-and-vision/counterfactual-os.md) — Motivation, problem space, and the speculative execution model.
- [Product Roadmap](0-context-and-vision/product-roadmap.md) — Strategic roadmap and evolution phases.
- [Business Goals & ROI](0-context-and-vision/business-goals.md) — Enterprise value proposition, token economics, and reliability ROI.
- [Ubiquitous Language](0-context-and-vision/ubiquitous-language.md) — Canonical domain terminology, entities, and ontology.

### [Module 1: Prise en Main et Installation](1-onboarding-and-setup/)
- [Local Environment Setup](1-onboarding-and-setup/local-environment.md) — Rust, Node.js, Python, and local CAS storage setup.
- [Install an Alpha](1-onboarding-and-setup/install-alpha.md) — Safe source builds, future prerelease archives, and checksum verification.
- [Run Studio with Docker Compose](1-onboarding-and-setup/studio-docker.md) — One-command local Studio stack with persistent SQLite storage and health checks.
- [Environment Variable Reference](1-onboarding-and-setup/environment-variables.md) — Single source of truth for backend, Studio and benchmark variables.
- [Architecture Tour](1-onboarding-and-setup/architecture-tour.md) — 15-minute guided walkthrough of the core crates.
- [Quickstart Tutorial](1-onboarding-and-setup/quickstart-tutorial.md) — Hands-on guide to spawning your first counterfactual agent.

### [Module 2: Architecture et Décisions Techniques](2-architecture/)
- [System Overview](2-architecture/overview.md) — Global architecture and crate decomposition.
- [Traceability Matrix](2-architecture/traceability-matrix.md) — Mapping requirements to core implementations.
- [Project Primitive Matrix](2-architecture/project-primitive-matrix.md) — Low-level runtime primitives and lifecycle contracts.
- [Architecture Decision Records (ADRs)](2-architecture/adrs/) — 21 accepted ADRs covering event sourcing, CAS, merge algebra, and resilience.

### [Module 3: Fonctionnalités et Domaine](3-features-and-domain/)
- [Agent Primitives & Lifecycle](3-features-and-domain/agent-primitives.md) — `fork`, `snapshot`, `restore`, `merge`, and `blame`.
- [Phenotype & Genomic Adaptation](3-features-and-domain/phenotype.md) — Genetic evolution and runtime phenotypic traits.
- [Counterfactual Simulation](3-features-and-domain/counterfactual-simulation.md) — Speculative multi-branch exploration.
- [Causal & Contextual Isolation](3-features-and-domain/causal-and-contextual-isolation.md) — Logical and directory-world boundaries, including known limitations.
- [Determinism & Reproducibility](3-features-and-domain/determinism-and-reproducibility.md) — Reducer replay scope and nondeterministic boundaries.
- [Biomimicry & Multi-Agent Swarms](3-features-and-domain/biomimicry/) — Swarm consensus, flocking, network quorum, and distributed huddling.
- [Cellular Resilience Suite](3-features-and-domain/resilience/) — Apoptosis, cryptobiosis, hypermutation, and cyber immune response.

### [Module 4: Interfaces et Protocoles](4-interfaces/)
- [GenOS Protocol Specification](4-interfaces/genos-protocol.md) — Inter-agent messaging, event schemas, and RPC.
- [MCP Tools Reference](4-interfaces/mcp-tools-reference.md) — Model Context Protocol interfaces and maturity notes.
- [CLI Reference Manual](4-interfaces/cli-reference.md) — Comprehensive command-line interface documentation.
- [External Integrations](4-interfaces/integrations/) — IDE, CI/CD, and external agent bridges.

### [Module 5: Workflows de Développement](5-development-workflows/)
- [Coding Guidelines](5-development-workflows/coding-guidelines.md) — Strict rules: Max 400 lines, Max 3 parameters, low complexity.
- [Testing & Verification Strategy](5-development-workflows/testing-strategy.md) — Property-based, integration, and chaos testing.
- [Contributing Guide](5-development-workflows/contributing-guide.md) — Contribution workflows and branch policies.
- [Good First Issue Backlog](5-development-workflows/good-first-issues.md) — Five bounded, testable starter contributions.
- [GitHub Launch Backlog](5-development-workflows/launch-backlog.md) — Trust, distribution, proof, evidence, and community gates.

### [Module 6: Opérations et Déploiement](6-operations-and-deployment/)
- [Deployment Design](6-operations-and-deployment/production-deployment.md) — Target Kubernetes, Docker, and bare-metal topology; verify current maturity before use.
- [Deployment Audit](6-operations-and-deployment/deployment-audit.md) — Evidence-bounded audit of the shipped Compose deployment and its remaining production gaps.
- [Studio Navigation Audit](6-operations-and-deployment/studio-navigation-audit.md) — Navigation coverage, unreachable legacy views, and backend route evidence.
- [Operations Runbooks](6-operations-and-deployment/runbooks/) — Incident response, CAS maintenance, and telemetry.

### [Module 7: Benchmarks, Comparatifs et Théorie](7-benchmarks-and-comparisons/)
- [Linear Attempts and GenOS Branching](7-benchmarks-and-comparisons/simple-agent-vs-genos.md) — Evidence-bounded execution comparison with explicit non-claims.
- [Competitive Evaluation Matrix](7-benchmarks-and-comparisons/competitive-matrix.md) — Evidence-gated comparison plan with no unvalidated leaderboard values.
- [Resilience Benchmark Methodology](7-benchmarks-and-comparisons/resilience-benchmarks.md) — MTTR, CPR, CBIF, TWR, and ChaosAgent-Bench suite.
- [Proof & Benchmark Status](7-benchmarks-and-comparisons/proof-and-benchmark-status.md) — What is measured, how to reproduce it, and what evidence is still missing.
- [Theoretical Foundations](7-benchmarks-and-comparisons/theoretical-foundations.md) — Arguments, assumptions, and proposed models; not benchmark results.

### [Research Notes (FR)](research/)
Non-normative research corpus, written in French. These documents are
exploratory working papers: nothing there is implemented or promised unless an
ADR or a Module page says otherwise.
- [Biomimicry Research Report](research/biomimicry/part1.md) — Master report on biomimetic architecture (parts 1–4).
- [Advanced AI Research](research/advanced-ai/part1.md) — Hallucination mitigation, RAG, and agentic systems (parts 1–4).
- [Deep Research 1–3](research/deep-1/part1.md) — Hallucination causes, uncertainty & honesty, strategic synthesis.
- [Legacy French Notes](research/fr/) — Earlier consolidated reports (`RAPPORT_*`, `BIOMIMICRY_*`, `EPIC*`, backlog drafts).

### [Launch Kit](launch/)
- [Alpha Release Notes](launch/alpha-release-notes.md) — User-facing contents, verification, and limitations for `v0.0.1-alpha.1`.
- [Technical Launch Post](launch/technical-launch-post.md) — The safe-parallel-debugging story and evidence boundaries.
- [Community Post Drafts](launch/community-posts.md) — Launch copy and response checklist.

---

## 🧭 4 Guided Reading Paths

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 GUIDED READING PATHS                                   │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ Persona                 │ Recommended Sequential Path                                  │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 💻 Application Devs     │ 1. [Local Setup](1-onboarding-and-setup/local-environment.md)│
│                         │ 2. [Quickstart](1-onboarding-and-setup/quickstart-tutorial.md)│
│                         │ 3. [Agent Primitives](3-features-and-domain/agent-primitives.md)│
│                         │ 4. [MCP Tools Reference](4-interfaces/mcp-tools-reference.md) │
│                         │ 5. [Coding Guidelines](5-development-workflows/coding-guidelines.md)│
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 🏗️ System Architects    │ 1. [Counterfactual OS](0-context-and-vision/counterfactual-os.md)│
│                         │ 2. [System Overview](2-architecture/overview.md)             │
│                         │ 3. [ADR Index](2-architecture/adrs/)                         │
│                         │ 4. [Competitive Matrix](7-benchmarks-and-comparisons/competitive-matrix.md)│
│                         │ 5. [Causal Isolation](3-features-and-domain/causal-and-contextual-isolation.md)│
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 🔬 AI Researchers       │ 1. [Theoretical Foundations](7-benchmarks-and-comparisons/theoretical-foundations.md)│
│                         │ 2. [Counterfactual Simulation](3-features-and-domain/counterfactual-simulation.md)│
│                         │ 3. [Phenotype Adaptation](3-features-and-domain/phenotype.md) │
│                         │ 4. [Biomimicry Swarm](3-features-and-domain/biomimicry/)     │
│                         │ 5. [Resilience Benchmarks](7-benchmarks-and-comparisons/resilience-benchmarks.md)│
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 🛡️ Enterprise & SRE     │ 1. [Production Deployment](6-operations-and-deployment/production-deployment.md)│
│                         │ 2. [Business Goals & ROI](0-context-and-vision/business-goals.md)│
│                         │ 3. [Operations Runbooks](6-operations-and-deployment/runbooks/)│
│                         │ 4. [Cellular Resilience](3-features-and-domain/resilience/)  │
│                         │ 5. [Determinism & Replay](3-features-and-domain/determinism-and-reproducibility.md)│
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start: Counterfactual Forking

The maintained, end-to-end quickstart uses the `genos` CLI rather than an
unstable library example. Build the CLI from the repository root, then follow
the walkthrough for agent creation, snapshots, capsules, isolated branches,
diffs, merge, lineage, and replay:

```bash
cargo build -p genos-cli
cargo run -p genos-cli -- --help
```

See [Quickstart Tutorial](1-onboarding-and-setup/quickstart-tutorial.md).
Command output contains generated identifiers and timestamps, so the values
shown in the tutorial are illustrative rather than fixed fixtures.

---

## 📄 License & Governance

GenOS is licensed under the Apache 2.0 License. See [LICENSE](../LICENSE) for complete terms.

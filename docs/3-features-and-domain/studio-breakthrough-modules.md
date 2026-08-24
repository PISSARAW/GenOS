# Studio Breakthrough Modules Guide

Companion to the [Studio User Guide](studio-user-guide.md). These are the
research-flavored operational modules: each one is backed by real backend
endpoints, but their heuristics (fitness scores, ELO, entropy) are
experimental and labeled as such in the interface.

## Arena & Solvers

Three tabs around competitive multi-solver execution:

- **Solver Tournament** — pick a benchmark and number of rounds, run
  **Run Benchmark** and watch the ELO leaderboard (champion, win rates).
  **Pollinate from this** injects a solver's heuristics into the shared
  blackboard; record your own with **Record Heuristic Note**.
- **Pareto Frontier** — scatter chart of candidate solutions (time or cost vs
  fitness) with the Pareto frontier highlighted and the backend's knee-point
  recommendation.
- **Resolution Traces** — load a tournament id and inspect step-by-step
  execution traces, then export as JSON-DAG, OTLP/Jaeger or an HTML replay.

## Evaluation & Lineage

Real-time console (8 s refresh): MCTS tree with per-node score/visits and
**Prune**, ImpossibleBench abstention testing behind a safety threshold
slider, SHA-256 provenance chain of decisions (**Copy** a hash), weighted
quorum/stigmergy signals and notification preferences
(**Save policy** / **Revert**).

## MCP Sandbox & Tools

The tool arsenal: filter tools, inspect their JSON schema (a form is generated
dynamically), then:

1. **Run VFS Dry-Run** — simulates the call on a virtual filesystem and shows
   a blast-radius score with predicted side effects (files created, modified,
   deleted, subprocess spawns).
2. **Execute for Real** — gated behind the RBAC gate; requires the
   `mcp:execute_safe` permission.

The per-tool circuit breaker table tracks error counts and circuit state;
quarantine a misbehaving tool with **Quarantine**.

## Swarm Monitor & Quorum

- **Swarm Topology** — live SVG graph of agent links (2 s refresh), click a
  node to open its profile.
- **Entropy Drift** — Shannon entropy of swarm cognition over time.
- **Quorum Voting** — democratic proposals with supermajority bars:
  broadcast your own via **New Proposal**, vote yes/no per proposal
  (5 s refresh).

## Biology & Resilience

Biomimetic failure handling:

- **Adaptive Apoptosis** — thresholds for sacrificing failing agents
  (consecutive failures, cost ceiling, semantic divergence) plus termination
  autopsies with recommended patches.
- **Cryptobiosis** — freeze an entire swarm runtime into a snapshot
  (**Freeze Swarm**) and restore it later (**Resume Swarm**).
- **Health Matrix** — per-tool health cards with blast radius and global halt
  reset.

## Genetics & Genome

Cognitive DNA management across three tabs: phylogenetic tree of agents
(clone or kill nodes), allele frequency analysis, and genetic crossover —
recombine two agents into offspring you can deploy.

## Memory & Experience

Episodic memory engine:

- **Vector Semantic Search** — cosine search over stored experience.
- **Golden Path Synthesis** — cherry-pick successful trajectory steps and fuse
  them into reusable "golden path" genome DNA.
- **What-If Branching** — reconstruct a counterfactual branch from any past
  trajectory and execute it in sandbox to compare outcomes.

## Workspace Timeline & Diff

Forensics on recorded workspace changes:

- **Recorded Diff** — structural diff between two branches/revisions.
- **Causal bisection** — give a test command (e.g. `npm test -- --runInBand`);
  Studio bisects snapshots logarithmically inside a temporary copy and names
  the culprit step/agent, then offers **Preview rollback**.
- **Atomic rollback** — preview the reverse patch for a snapshot step and
  confirm; a safety snapshot is captured before applying.

## RAG Playground

Hybrid retrieval over indexed GenOS documents: ask a question, tune page size,
filter by category, inspect lexical/semantic scores and copy the provenance of
any cited chunk. Documents are indexed from the RAG tab of Studio Builder.

## Studio Builder

The workflow workbench, organized in tabs:

| Tab | What you do |
|---|---|
| Workflow | Build graphs on a ReactFlow canvas (LLM/Agent, Tool call, Condition, Parallel branch, Loop, Human review, Guardrail). Import/Export JSON, **Save workflow**, **Run workflow**. |
| Prompts | Versioned prompt registry with variables; render a version and stream a multi-model playground run. |
| Runs & Traces | OpenTelemetry trace explorer persisted by the backend; replay a selected trace. |
| Evaluation | Evaluation runs, MCTS nodes, datasets and queued jobs; run ImpossibleBench. |
| RAG | Index documents into the knowledge base and test retrieval. |
| Integrations | Registered model providers, MCP tools, IDE connections and installable connectors. |
| Deployment | Deploy an agent mission, create staging releases, promote or roll them back, watch live telemetry. |

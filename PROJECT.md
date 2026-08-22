# GenOS project brief

## Product focus

**Git-like branching and deterministic replay for AI-agent state.**

GenOS explores a versioned execution model in which an agent workflow can be
snapshotted, forked into isolated hypotheses, compared, replayed, audited, and
merged conditionally. The project is pre-alpha; implemented behavior and future
designs are intentionally documented separately.

## Maintained product surfaces

| Surface | Purpose | Status |
| --- | --- | --- |
| Rust workspace | State, runtime, storage, world, evaluation, API, and CLI primitives | Pre-alpha |
| GenOS Studio | Local browser view for agents, workspaces, lineage, evaluation, and telemetry | Pre-alpha |
| Examples | Focused executable proofs of individual invariants | Experimental |
| Research archive | Preserved solvers, datasets, and historical outputs | Unsupported archive |

## Evidence contract

- Product claims link to source, a focused test, or an executable example.
- Quantitative claims require raw results, environment metadata, and an exact
  command tied to a revision.
- Unsupported metrics remain `unsupported`; missing results remain `missing`.
- Logical state isolation is not described as OS process or network sandboxing.
- Roadmap capabilities are labeled as targets until implemented and reproduced.

See [proof and benchmark status](docs/7-benchmarks-and-comparisons/proof-and-benchmark-status.md)
for the current evidence ledger.

## Launch gates

The project should not represent itself as production-ready until its CI,
distribution, security boundaries, benchmark evidence, and external validation
meet the [GitHub launch backlog](docs/5-development-workflows/launch-backlog.md).

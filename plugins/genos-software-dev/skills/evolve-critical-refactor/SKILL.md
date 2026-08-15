---
name: evolve-critical-refactor
description: Explore a critical-system refactor through long-running, recursively forked implementation lineages with isolated workspaces, tests, benchmarks, fuzzing, migration checks, multidimensional evaluation, and reusable discoveries. Use for monolith decomposition, synchronous-to-distributed migrations, or other high-risk architectural transformations.
---

# Evolve Critical Refactor

Use `genos_workspace_experiment` from the GenOS MCP server.

## Workflow

1. Capture public behavior, migration invariants, performance constraints, data compatibility, and rollback requirements before proposing branches.
2. Build a workspace plan with diverse top-level hypotheses and explicit descendant relationships. Prefer architectural alternatives over cosmetic variations.
3. Attach bounded tests, benchmarks, fuzzing, and migration probes to each applicable branch. Record budgets and expected failure conditions.
4. Call `genos_workspace_experiment` with `repo` and `plan`, or with one complete `manifest`.
5. Evaluate correctness, migration safety, performance, cost, operational complexity, and evidence quality separately. Preserve Pareto tradeoffs when no single branch dominates.
6. Explain why hypotheses failed and identify discoveries reusable by the selected lineage. Do not equate selection with blindly unioning branch workspaces.
7. Return the recursive lineage, surviving branch, reusable discoveries, unresolved risks, and persisted report path.

Stop and request direction before applying the winning refactor to the source repository; isolated experimentation does not authorize deployment or merge.
